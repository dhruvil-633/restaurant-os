import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { customers, menuCategories, menuItems, orderItems, orders } from '../db/schema';
import { recordActivity } from '../services/activityLog';
import { notifyRoles } from '../services/notification';
import { calculateTotals, generateOrderNumber, type PricedLine } from '../services/orderService';
import { getSettings } from '../services/settingsService';
import { realtime } from '../socket';
import { SOCKET_EVENTS } from '../socket/events';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../utils/apiResponse';
import { money, toNumber } from '../utils/serialize';
import { publicOrderSchema, trackOrderSchema } from '../validators/publicOrder';

/**
 * Everything in this controller is reachable without a token, so each handler
 * exposes only what a guest needs and nothing about staff, costs or margins.
 */

/**
 * Matches a phone number on its last 10 digits.
 *
 * The same person is stored as "+91 98765 43210" but types "9876543210", so
 * comparing full digit strings fails on the country code. The national number
 * is the stable part, and it is long enough to identify one guest.
 */
function samePhoneNumber(digits: string) {
  return sql`right(regexp_replace(${customers.phone}, '[^0-9]', '', 'g'), 10) = right(${digits}, 10)`;
}

/** The menu a guest can order from — available items only, no cost or margin. */
export const getPublicMenu = asyncHandler(async (_req: Request, res: Response) => {
  const [categories, settings] = await Promise.all([
    db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.isActive, true))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.name)),
    getSettings(),
  ]);

  const items = categories.length
    ? await db
        .select({
          id: menuItems.id,
          categoryId: menuItems.categoryId,
          name: menuItems.name,
          description: menuItems.description,
          price: menuItems.price,
          imageUrl: menuItems.imageUrl,
          prepTimeMinutes: menuItems.prepTimeMinutes,
          isVegetarian: menuItems.isVegetarian,
          spiceLevel: menuItems.spiceLevel,
          calories: menuItems.calories,
          isFeatured: menuItems.isFeatured,
        })
        .from(menuItems)
        .where(
          and(
            eq(menuItems.isAvailable, true),
            inArray(
              menuItems.categoryId,
              categories.map((category) => category.id),
            ),
          ),
        )
        .orderBy(asc(menuItems.sortOrder), asc(menuItems.name))
    : [];

  sendSuccess(
    res,
    {
      restaurant: {
        name: settings.restaurantName,
        address: settings.address,
        phone: settings.phone,
        currencySymbol: settings.currencySymbol,
        taxRatePercent: settings.taxRatePercent,
      },
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        type: category.type,
        description: category.description,
        items: items
          .filter((item) => item.categoryId === category.id)
          .map((item) => ({ ...item, price: toNumber(item.price) })),
      })),
    },
    'Menu loaded',
  );
});

/** Places a guest order. Pricing is always recomputed server-side. */
export const createPublicOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = publicOrderSchema.parse(req.body);

  const menuItemIds = [...new Set(input.items.map((item) => item.menuItemId))];
  const dishes = await db.select().from(menuItems).where(inArray(menuItems.id, menuItemIds));

  if (dishes.length !== menuItemIds.length) {
    throw ApiError.badRequest('One of those dishes is no longer on the menu');
  }

  const unavailable = dishes.filter((dish) => !dish.isAvailable);
  if (unavailable.length > 0) {
    throw ApiError.badRequest(
      `${unavailable.map((dish) => dish.name).join(', ')} just sold out. Please remove it and try again.`,
    );
  }

  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));

  // Prices come from the database, never from the request body.
  const lines: PricedLine[] = input.items.map((item) => {
    const dish = dishById.get(item.menuItemId);
    if (!dish) throw ApiError.badRequest('That dish is no longer available');
    const unitPrice = toNumber(dish.price);
    return {
      menuItemId: dish.id,
      nameSnapshot: dish.name,
      unitPrice,
      quantity: item.quantity,
      lineTotal: money(unitPrice * item.quantity),
      prepTimeMinutes: dish.prepTimeMinutes,
      notes: item.notes || null,
    };
  });

  const totals = await calculateTotals(lines, 0);

  // Reuse the guest record when the phone is already known, so their order
  // history and loyalty keep accruing to one profile.
  const digits = input.customerPhone.replace(/\D/g, '');
  const [existing] = await db
    .select()
    .from(customers)
    .where(samePhoneNumber(digits))
    .limit(1);

  let customerId = existing?.id ?? null;
  if (!customerId) {
    const [created] = await db
      .insert(customers)
      .values({
        name: input.customerName,
        phone: input.customerPhone,
        email: input.customerEmail || null,
        firstVisitAt: new Date(),
      })
      .returning();
    customerId = created?.id ?? null;
  }

  const created = await db.transaction(async (tx) => {
    let orderRow;

    for (let attempt = 0; attempt < 5 && !orderRow; attempt += 1) {
      const base = await generateOrderNumber();
      const orderNumber = attempt === 0 ? base : `${base}-${String(attempt).padStart(2, '0')}`;

      const inserted = await tx
        .insert(orders)
        .values({
          orderNumber,
          type: input.type,
          status: 'pending',
          customerId,
          guestCount: 1,
          subtotal: String(totals.subtotal),
          taxAmount: String(totals.taxAmount),
          discountAmount: '0',
          total: String(totals.total),
          deliveryAddress: input.deliveryAddress || null,
          notes: input.notes ? `[Online order] ${input.notes}` : '[Online order]',
        })
        .onConflictDoNothing({ target: orders.orderNumber })
        .returning();

      orderRow = inserted[0];
    }

    if (!orderRow) throw ApiError.internal('Could not place the order. Please try again.');

    await tx.insert(orderItems).values(
      lines.map((line) => ({
        orderId: orderRow.id,
        menuItemId: line.menuItemId,
        nameSnapshot: line.nameSnapshot,
        unitPrice: String(line.unitPrice),
        quantity: line.quantity,
        lineTotal: String(line.lineTotal),
        prepTimeMinutes: line.prepTimeMinutes,
        notes: line.notes,
      })),
    );

    return orderRow;
  });

  const wirePayload = {
    id: created.id,
    orderNumber: created.orderNumber,
    type: created.type,
    status: created.status,
    total: toNumber(created.total),
    customerName: input.customerName,
    tableLabel: null,
    placedAt: created.placedAt.toISOString(),
    items: lines.map((line) => ({ name: line.nameSnapshot, quantity: line.quantity })),
  };

  realtime.toKitchen(SOCKET_EVENTS.ORDER_CREATED, wirePayload);
  realtime.toFloor(SOCKET_EVENTS.ORDER_CREATED, wirePayload);

  await notifyRoles(['chef', 'kitchen_staff', 'manager'], {
    type: 'order_created',
    title: `Online order ${created.orderNumber}`,
    message: `${input.customerName} · ${input.type.replace('_', ' ')} · ${lines.length} item${lines.length === 1 ? '' : 's'}`,
    link: '/kitchen',
    payload: { orderId: created.id },
  });

  await recordActivity({
    actorName: input.customerName,
    action: 'order.created',
    entityType: 'order',
    entityId: created.id,
    description: `${input.customerName} placed online order ${created.orderNumber}`,
    metadata: { total: totals.total, source: 'public' },
  });

  const estimatedMinutes = Math.max(...lines.map((line) => line.prepTimeMinutes), 10);

  sendCreated(
    res,
    {
      orderNumber: created.orderNumber,
      status: created.status,
      type: created.type,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      estimatedMinutes,
      placedAt: created.placedAt.toISOString(),
      items: lines.map((line) => ({
        name: line.nameSnapshot,
        quantity: line.quantity,
        lineTotal: line.lineTotal,
      })),
    },
    `Order ${created.orderNumber} received`,
  );
});

/**
 * Lets a guest follow their order. The phone number acts as the shared secret,
 * so knowing an order number alone reveals nothing.
 */
export const trackPublicOrder = asyncHandler(async (req: Request, res: Response) => {
  const input = trackOrderSchema.parse(req.query);
  const digits = input.phone.replace(/\D/g, '');

  const [row] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      type: orders.type,
      total: orders.total,
      placedAt: orders.placedAt,
      readyAt: orders.readyAt,
      completedAt: orders.completedAt,
      customerName: customers.name,
    })
    .from(orders)
    .innerJoin(customers, eq(orders.customerId, customers.id))
    .where(
      and(eq(orders.orderNumber, input.orderNumber.toUpperCase()), samePhoneNumber(digits)),
    )
    .limit(1);

  if (!row) throw ApiError.notFound('Order');

  const items = await db
    .select({ name: orderItems.nameSnapshot, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, row.id));

  const STAGES = ['pending', 'cooking', 'ready', 'served', 'completed'];

  sendSuccess(
    res,
    {
      orderNumber: row.orderNumber,
      status: row.status,
      type: row.type,
      total: toNumber(row.total),
      customerName: row.customerName,
      placedAt: row.placedAt.toISOString(),
      readyAt: row.readyAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      stageIndex: STAGES.indexOf(row.status),
      elapsedMinutes: Math.round((Date.now() - row.placedAt.getTime()) / 60_000),
      items,
    },
    'Order found',
  );
});
