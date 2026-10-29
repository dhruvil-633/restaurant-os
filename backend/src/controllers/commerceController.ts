import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import {
  customers,
  ingredients,
  loyaltyRewards,
  orders,
  payments,
  rewardRedemptions,
  suppliers,
  users,
  type LoyaltyRewardRow,
} from '../db/schema';
import { requireUser } from '../middlewares/auth';
import { recordActivity } from '../services/activityLog';
import { finaliseSettlement, recalculateOrderTotals } from '../services/orderService';
import { realtime } from '../socket';
import { SOCKET_EVENTS } from '../socket/events';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../utils/apiResponse';
import { money, toNumber } from '../utils/serialize';
import {
  addPaymentSchema,
  redeemRewardSchema,
  reorderQuerySchema,
  rewardSchema,
} from '../validators/commerce';

/* ── Split bill ─────────────────────────────────────────────────────────── */

/** The bill, what has been tendered so far, and what is still owed. */
async function billState(orderId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw ApiError.notFound('Order');

  const rows = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      method: payments.method,
      payerLabel: payments.payerLabel,
      reference: payments.reference,
      createdAt: payments.createdAt,
      receivedBy: users.name,
    })
    .from(payments)
    .leftJoin(users, eq(payments.receivedById, users.id))
    .where(eq(payments.orderId, orderId))
    .orderBy(asc(payments.createdAt));

  const total = toNumber(order.total);
  const paid = money(rows.reduce((sum, row) => sum + toNumber(row.amount), 0));

  return {
    order,
    payments: rows.map((row) => ({
      ...row,
      amount: toNumber(row.amount),
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    paid,
    balance: money(Math.max(0, total - paid)),
    // The tolerance absorbs rounding on a three-way split; without it a bill
    // can sit a paisa short forever and never close.
    isSettled: paid + 0.009 >= total,
  };
}

export const getBillPayments = asyncHandler(async (req: Request, res: Response) => {
  const state = await billState(req.params.id as string);
  sendSuccess(
    res,
    {
      orderNumber: state.order.orderNumber,
      total: state.total,
      paid: state.paid,
      balance: state.balance,
      isSettled: state.isSettled,
      paymentStatus: state.order.paymentStatus,
      payments: state.payments,
    },
    'Payments loaded',
  );
});

/**
 * Takes one tender against a bill. The bill closes itself the moment the
 * tendered total covers it, so a table paying in four runs through the same
 * settlement path as one card.
 */
export const addPayment = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = addPaymentSchema.parse(req.body);
  const id = req.params.id as string;

  const before = await billState(id);

  if (before.order.status === 'cancelled') {
    throw ApiError.badRequest('A cancelled order cannot be paid');
  }
  if (before.isSettled) throw ApiError.conflict('This bill is already fully paid');

  // Refuse to record more than is owed rather than silently implying change.
  if (input.amount > before.balance + 0.01) {
    throw ApiError.badRequest(
      `That is more than the ${before.balance} still owed. Take ${before.balance} or less.`,
    );
  }

  await db.insert(payments).values({
    restaurantId: before.order.restaurantId,
    orderId: id,
    amount: String(money(input.amount)),
    method: input.method,
    payerLabel: input.payerLabel || null,
    reference: input.reference || null,
    receivedById: user.id,
  });

  const after = await billState(id);

  if (after.isSettled) {
    await finaliseSettlement(id, input.method, user.id);
    realtime.toFloor(SOCKET_EVENTS.ORDER_COMPLETED, { id, orderNumber: after.order.orderNumber });
    realtime.toManagement(SOCKET_EVENTS.ORDER_COMPLETED, { id });
  }

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: after.isSettled ? 'order.settled' : 'order.part_paid',
    entityType: 'order',
    entityId: id,
    description:
      `${user.name} took ${input.amount} by ${input.method} on ${after.order.orderNumber}` +
      (after.isSettled ? ' — bill closed' : ` (${after.balance} left)`),
    metadata: { amount: input.amount, method: input.method, balance: after.balance },
  });

  sendCreated(
    res,
    {
      total: after.total,
      paid: after.paid,
      balance: after.balance,
      isSettled: after.isSettled,
      payments: after.payments,
    },
    after.isSettled ? 'Bill settled' : `Recorded — ${after.balance} still owed`,
  );
});

/** Reverses a mis-keyed tender, only while the bill is still open. */
export const voidPayment = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = req.params.id as string;
  const paymentId = req.params.paymentId as string;

  const state = await billState(id);
  if (state.order.paymentStatus === 'paid') {
    throw ApiError.badRequest('This bill is closed. Refund it rather than voiding a line.');
  }

  const [removed] = await db
    .delete(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.orderId, id)))
    .returning();

  if (!removed) throw ApiError.notFound('Payment');

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'order.payment_voided',
    entityType: 'order',
    entityId: id,
    description: `${user.name} voided a ${toNumber(removed.amount)} ${removed.method} payment`,
  });

  const after = await billState(id);
  sendSuccess(
    res,
    { paid: after.paid, balance: after.balance, payments: after.payments },
    'Payment voided',
  );
});

/* ── Loyalty rewards ────────────────────────────────────────────────────── */

function toRewardDto(row: LoyaltyRewardRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    pointsCost: row.pointsCost,
    type: row.type,
    value: toNumber(row.value),
    menuItemId: row.menuItemId,
    maxDiscount: row.maxDiscount === null ? null : toNumber(row.maxDiscount),
    isActive: row.isActive,
  };
}

export const listRewards = asyncHandler(async (req: Request, res: Response) => {
  const rows = await db.select().from(loyaltyRewards).orderBy(asc(loyaltyRewards.pointsCost));

  // A customerId makes the list actionable: which can this guest afford now.
  const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : undefined;
  let points: number | null = null;

  if (customerId) {
    const [customer] = await db
      .select({ loyaltyPoints: customers.loyaltyPoints })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    points = customer?.loyaltyPoints ?? null;
  }

  sendSuccess(
    res,
    {
      customerPoints: points,
      rewards: rows.map((row) => ({
        ...toRewardDto(row),
        affordable: points === null ? null : points >= row.pointsCost,
      })),
    },
    'Rewards loaded',
  );
});

export const createReward = asyncHandler(async (req: Request, res: Response) => {
  const input = rewardSchema.parse(req.body);
  const [anyOrder] = await db.select({ restaurantId: orders.restaurantId }).from(orders).limit(1);

  const [created] = await db
    .insert(loyaltyRewards)
    .values({
      restaurantId: anyOrder?.restaurantId ?? null,
      name: input.name,
      description: input.description || null,
      pointsCost: input.pointsCost,
      type: input.type,
      value: String(input.value),
      menuItemId: input.menuItemId ?? null,
      maxDiscount: input.maxDiscount === undefined ? null : String(input.maxDiscount),
      isActive: input.isActive,
    })
    .returning();

  if (!created) throw ApiError.internal('Could not create the reward');
  sendCreated(res, toRewardDto(created), 'Reward created');
});

export const updateReward = asyncHandler(async (req: Request, res: Response) => {
  const input = rewardSchema.partial().parse(req.body);
  const id = req.params.id as string;

  const [updated] = await db
    .update(loyaltyRewards)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.pointsCost !== undefined ? { pointsCost: input.pointsCost } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.value !== undefined ? { value: String(input.value) } : {}),
      ...(input.menuItemId !== undefined ? { menuItemId: input.menuItemId } : {}),
      ...(input.maxDiscount !== undefined
        ? { maxDiscount: input.maxDiscount === null ? null : String(input.maxDiscount) }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    })
    .where(eq(loyaltyRewards.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Reward');
  sendSuccess(res, toRewardDto(updated), 'Reward updated');
});

export const deleteReward = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  // Redemptions reference it, so retire rather than delete and rewrite history.
  const [updated] = await db
    .update(loyaltyRewards)
    .set({ isActive: false })
    .where(eq(loyaltyRewards.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Reward');
  sendSuccess(res, null, `${updated.name} retired`);
});

/**
 * Spends a guest's points against an open bill.
 *
 * The deduction, the redemption record and the discount all land in one
 * transaction, so a failure can never leave a guest charged points for a
 * discount they did not get.
 */
export const redeemReward = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = redeemRewardSchema.parse(req.body);

  const [reward] = await db
    .select()
    .from(loyaltyRewards)
    .where(eq(loyaltyRewards.id, input.rewardId))
    .limit(1);

  if (!reward) throw ApiError.notFound('Reward');
  if (!reward.isActive) throw ApiError.badRequest('That reward is no longer available');

  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) throw ApiError.notFound('Order');
  if (order.paymentStatus === 'paid') throw ApiError.badRequest('This bill is already paid');

  const customerId = input.customerId ?? order.customerId;
  if (!customerId) throw ApiError.badRequest('Attach a guest to this order before redeeming');

  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) throw ApiError.notFound('Customer');

  if (customer.loyaltyPoints < reward.pointsCost) {
    throw ApiError.badRequest(
      `${customer.name} has ${customer.loyaltyPoints} points; this reward costs ${reward.pointsCost}.`,
    );
  }

  // Never let a reward exceed its cap or the bill it is applied to.
  const subtotal = toNumber(order.subtotal);
  const raw =
    reward.type === 'discount_percent'
      ? (subtotal * toNumber(reward.value)) / 100
      : toNumber(reward.value);
  const capped = reward.maxDiscount === null ? raw : Math.min(raw, toNumber(reward.maxDiscount));
  const discount = money(Math.min(capped, subtotal));

  await db.transaction(async (tx) => {
    await tx
      .update(customers)
      .set({
        loyaltyPoints: sql`${customers.loyaltyPoints} - ${reward.pointsCost}`,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, customerId));

    await tx.insert(rewardRedemptions).values({
      restaurantId: order.restaurantId,
      customerId,
      rewardId: reward.id,
      orderId: order.id,
      rewardName: reward.name,
      pointsSpent: reward.pointsCost,
      discountApplied: String(discount),
      redeemedById: user.id,
    });

    await tx
      .update(orders)
      .set({
        discountAmount: String(money(toNumber(order.discountAmount) + discount)),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));
  });

  const totals = await recalculateOrderTotals(order.id);

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'loyalty.redeemed',
    entityType: 'order',
    entityId: order.id,
    description: `${customer.name} redeemed "${reward.name}" for ${discount} off ${order.orderNumber}`,
    metadata: { pointsSpent: reward.pointsCost, discount },
  });

  sendSuccess(
    res,
    {
      rewardName: reward.name,
      pointsSpent: reward.pointsCost,
      pointsRemaining: customer.loyaltyPoints - reward.pointsCost,
      discountApplied: discount,
      orderTotal: totals.total,
    },
    `${discount} off — ${reward.name} redeemed`,
  );
});

export const listRedemptions = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      id: rewardRedemptions.id,
      rewardName: rewardRedemptions.rewardName,
      pointsSpent: rewardRedemptions.pointsSpent,
      discountApplied: rewardRedemptions.discountApplied,
      createdAt: rewardRedemptions.createdAt,
      customerName: customers.name,
      orderNumber: orders.orderNumber,
    })
    .from(rewardRedemptions)
    .leftJoin(customers, eq(rewardRedemptions.customerId, customers.id))
    .leftJoin(orders, eq(rewardRedemptions.orderId, orders.id))
    .orderBy(desc(rewardRedemptions.createdAt))
    .limit(50);

  sendSuccess(
    res,
    rows.map((row) => ({
      ...row,
      discountApplied: toNumber(row.discountApplied),
      createdAt: row.createdAt.toISOString(),
    })),
    'Redemptions loaded',
  );
});

/* ── Smart reorder ──────────────────────────────────────────────────────── */

type Urgency = 'out' | 'critical' | 'urgent' | 'soon';

/**
 * Turns the stock ledger into a shopping list.
 *
 * Flagging only what is already below its minimum tells the kitchen too late —
 * they are improvising by then. This projects each ingredient's burn rate
 * forward and surfaces what will run out inside the cover window.
 */
export const getReorderSuggestions = asyncHandler(async (req: Request, res: Response) => {
  const query = reorderQuerySchema.parse(req.query);
  const since = new Date();
  since.setDate(since.getDate() - query.lookbackDays);

  const rows = await db
    .select({
      id: ingredients.id,
      name: ingredients.name,
      unit: ingredients.unit,
      category: ingredients.category,
      currentStock: ingredients.currentStock,
      minStock: ingredients.minStock,
      maxStock: ingredients.maxStock,
      costPerUnit: ingredients.costPerUnit,
      supplierId: ingredients.supplierId,
      supplierName: suppliers.name,
      // Consumption and waste are both real depletion, so both count.
      used: sql<number>`coalesce((
        select sum(abs(t.quantity))
        from inventory_transactions t
        where t.ingredient_id = ${ingredients.id}
          and t.type in ('consumption','waste')
          and t.occurred_at >= ${since.toISOString()}
      ), 0)::float`,
    })
    .from(ingredients)
    .leftJoin(suppliers, eq(ingredients.supplierId, suppliers.id))
    .where(eq(ingredients.isActive, true));

  const suggestions = rows
    .map((row) => {
      const stock = toNumber(row.currentStock);
      const min = toNumber(row.minStock);
      const max = toNumber(row.maxStock);
      const cost = toNumber(row.costPerUnit);
      const dailyBurn = row.used / query.lookbackDays;

      // Nothing moving and above its floor means there is nothing to say.
      const daysRemaining = dailyBurn > 0 ? stock / dailyBurn : Number.POSITIVE_INFINITY;
      const belowMin = min > 0 && stock <= min;
      const runsOutSoon = daysRemaining <= query.coverDays;
      if (!belowMin && !runsOutSoon) return null;

      // Top up to max where one is set; otherwise buy the cover window plus
      // slack, so the next order is not immediately due again.
      const target = max > 0 ? max : dailyBurn * query.coverDays * 1.5;
      const suggestedQuantity = Math.max(0, Math.ceil((target - stock) * 100) / 100);
      if (suggestedQuantity <= 0) return null;

      const urgency: Urgency =
        stock <= 0 ? 'out' : belowMin ? 'critical' : daysRemaining <= 3 ? 'urgent' : 'soon';

      return {
        ingredientId: row.id,
        name: row.name,
        category: row.category,
        unit: row.unit,
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        currentStock: stock,
        minStock: min,
        dailyBurn: Math.round(dailyBurn * 1000) / 1000,
        daysRemaining:
          daysRemaining === Number.POSITIVE_INFINITY ? null : Math.round(daysRemaining * 10) / 10,
        suggestedQuantity,
        estimatedCost: money(suggestedQuantity * cost),
        urgency,
        reason:
          stock <= 0
            ? 'Out of stock'
            : belowMin
              ? 'Below minimum'
              : `Runs out in about ${Math.round(daysRemaining)} days`,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const rank: Record<Urgency, number> = { out: 0, critical: 1, urgent: 2, soon: 3 };
  suggestions.sort((a, b) => rank[a.urgency] - rank[b.urgency] || b.estimatedCost - a.estimatedCost);

  // Grouped by supplier, because that is how the order actually gets placed.
  type Suggestion = (typeof suggestions)[number];
  const bySupplier = new Map<
    string,
    { supplierId: string | null; supplierName: string; items: Suggestion[]; total: number }
  >();

  for (const entry of suggestions) {
    const key = entry.supplierId ?? 'unassigned';
    const bucket = bySupplier.get(key) ?? {
      supplierId: entry.supplierId,
      supplierName: entry.supplierName ?? 'No supplier set',
      items: [] as Suggestion[],
      total: 0,
    };
    bucket.items.push(entry);
    bucket.total = money(bucket.total + entry.estimatedCost);
    bySupplier.set(key, bucket);
  }

  sendSuccess(
    res,
    {
      lookbackDays: query.lookbackDays,
      coverDays: query.coverDays,
      totalEstimatedCost: money(suggestions.reduce((sum, entry) => sum + entry.estimatedCost, 0)),
      counts: {
        out: suggestions.filter((entry) => entry.urgency === 'out').length,
        critical: suggestions.filter((entry) => entry.urgency === 'critical').length,
        total: suggestions.length,
      },
      suggestions,
      bySupplier: [...bySupplier.values()],
    },
    'Reorder suggestions ready',
  );
});
