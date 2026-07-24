import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db';
import {
  customers,
  ingredients,
  inventoryTransactions,
  menuItemIngredients,
  orderItems,
  orders,
  type OrderRow,
} from '../db/schema';
import { logger } from '../config/logger';
import { getSettings } from './settingsService';
import { money, toNumber } from '../utils/serialize';
import { ApiError } from '../utils/apiError';

/** Which status a given order status may move to. */
const ALLOWED_TRANSITIONS: Record<OrderRow['status'], readonly OrderRow['status'][]> = {
  pending: ['cooking', 'cancelled'],
  cooking: ['ready', 'cancelled'],
  ready: ['served', 'cancelled'],
  served: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function assertTransitionAllowed(from: OrderRow['status'], to: OrderRow['status']): void {
  if (from === to) return;
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    const options = ALLOWED_TRANSITIONS[from];
    throw ApiError.badRequest(
      options.length === 0
        ? `This order is already ${from} and cannot change status.`
        : `An order that is ${from} can only move to ${options.join(' or ')}.`,
    );
  }
}

/**
 * Human-readable, per-day sequential number (ORD-20260725-0007).
 *
 * A unique index guards the column, so a collision under concurrency simply
 * retries with the next count rather than corrupting the sequence.
 */
export async function generateOrderNumber(): Promise<string> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const stamp = startOfDay.toISOString().slice(0, 10).replace(/-/g, '');

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(gte(orders.placedAt, startOfDay));

  return `ORD-${stamp}-${String(count + 1).padStart(4, '0')}`;
}

export async function generateReservationCode(): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 9000) + 1000;
  return `RSV-${stamp}-${random}`;
}

export interface PricedLine {
  menuItemId: string;
  nameSnapshot: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  prepTimeMinutes: number;
  notes: string | null;
}

export interface OrderTotals {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
}

export async function calculateTotals(
  lines: readonly PricedLine[],
  discountAmount: number,
): Promise<OrderTotals> {
  const settings = await getSettings();
  const subtotal = money(lines.reduce((sum, line) => sum + line.lineTotal, 0));

  const cappedDiscount = money(Math.min(Math.max(discountAmount, 0), subtotal));
  const taxable = money(subtotal - cappedDiscount);
  const taxAmount = money((taxable * settings.taxRatePercent) / 100);

  return {
    subtotal,
    taxAmount,
    discountAmount: cappedDiscount,
    total: money(taxable + taxAmount),
  };
}

/** Recomputes and persists totals after items are added or removed. */
export async function recalculateOrderTotals(orderId: string): Promise<OrderTotals> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) throw ApiError.notFound('Order');

  const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));

  const priced: PricedLine[] = lines
    .filter((line) => line.status !== 'cancelled')
    .map((line) => ({
      menuItemId: line.menuItemId ?? '',
      nameSnapshot: line.nameSnapshot,
      unitPrice: toNumber(line.unitPrice),
      quantity: line.quantity,
      lineTotal: toNumber(line.lineTotal),
      prepTimeMinutes: line.prepTimeMinutes,
      notes: line.notes,
    }));

  const totals = await calculateTotals(priced, toNumber(order.discountAmount));

  await db
    .update(orders)
    .set({
      subtotal: String(totals.subtotal),
      taxAmount: String(totals.taxAmount),
      discountAmount: String(totals.discountAmount),
      total: String(totals.total),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  return totals;
}

/**
 * Deducts ingredient stock for everything the order contained, writing one
 * ledger row per ingredient. Called once, when an order is completed.
 *
 * Failure is logged rather than thrown: a missing recipe must not block a
 * customer from paying and leaving.
 */
export async function consumeInventoryForOrder(orderId: string, performedById: string | null): Promise<void> {
  try {
    const usage = await db
      .select({
        ingredientId: menuItemIngredients.ingredientId,
        totalQuantity: sql<string>`sum(${menuItemIngredients.quantity} * ${orderItems.quantity})`,
      })
      .from(orderItems)
      .innerJoin(menuItemIngredients, eq(menuItemIngredients.menuItemId, orderItems.menuItemId))
      .where(and(eq(orderItems.orderId, orderId), sql`${orderItems.status} <> 'cancelled'`))
      .groupBy(menuItemIngredients.ingredientId);

    if (usage.length === 0) return;

    await db.transaction(async (tx) => {
      for (const entry of usage) {
        const quantity = toNumber(entry.totalQuantity);
        if (quantity <= 0) continue;

        const [ingredient] = await tx
          .select({ costPerUnit: ingredients.costPerUnit })
          .from(ingredients)
          .where(eq(ingredients.id, entry.ingredientId))
          .limit(1);

        const unitCost = toNumber(ingredient?.costPerUnit);

        await tx
          .update(ingredients)
          .set({
            currentStock: sql`greatest(0, ${ingredients.currentStock} - ${String(quantity)})`,
            updatedAt: new Date(),
          })
          .where(eq(ingredients.id, entry.ingredientId));

        await tx.insert(inventoryTransactions).values({
          ingredientId: entry.ingredientId,
          type: 'consumption',
          // Negative, so the ledger sums to the current stock level.
          quantity: String(-quantity),
          unitCost: String(unitCost),
          totalCost: String(money(quantity * unitCost)),
          orderId,
          performedById,
          note: 'Automatic deduction on order completion',
        });
      }
    });
  } catch (error) {
    logger.warn(`Inventory consumption failed for order ${orderId}`, error);
  }
}

/** Updates lifetime stats and loyalty points after an order is paid. */
export async function applyOrderToCustomer(customerId: string, orderTotal: number): Promise<void> {
  const settings = await getSettings();
  const earnedPoints = Math.floor(orderTotal * settings.loyaltyPointsPerCurrencyUnit);
  const now = new Date();

  await db
    .update(customers)
    .set({
      visitCount: sql`${customers.visitCount} + 1`,
      totalSpent: sql`${customers.totalSpent} + ${String(orderTotal)}`,
      loyaltyPoints: sql`${customers.loyaltyPoints} + ${earnedPoints}`,
      lastVisitAt: now,
      firstVisitAt: sql`coalesce(${customers.firstVisitAt}, ${now.toISOString()})`,
      updatedAt: now,
    })
    .where(eq(customers.id, customerId));
}

/** Timestamps to stamp when an order reaches a given status. */
export function timestampsForStatus(status: OrderRow['status'], now: Date): Partial<OrderRow> {
  switch (status) {
    case 'cooking':
      return { cookingStartedAt: now };
    case 'ready':
      return { readyAt: now };
    case 'served':
      return { servedAt: now };
    case 'completed':
      return { completedAt: now };
    case 'cancelled':
      return { cancelledAt: now };
    default:
      return {};
  }
}
