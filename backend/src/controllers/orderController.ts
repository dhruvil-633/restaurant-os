import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Request, Response } from 'express';
import { db } from '../db';
import {
  customers,
  menuItems,
  orderItems,
  orders,
  restaurantTables,
  users,
  type OrderItemRow,
  type OrderRow,
} from '../db/schema';
import { requireUser } from '../middlewares/auth';
import { recordActivity } from '../services/activityLog';
import { notifyRoles } from '../services/notification';
import {
  applyOrderToCustomer,
  assertTransitionAllowed,
  calculateTotals,
  consumeInventoryForOrder,
  generateOrderNumber,
  recalculateOrderTotals,
  timestampsForStatus,
  type PricedLine,
} from '../services/orderService';
import { getSettings } from '../services/settingsService';
import { realtime } from '../socket';
import { SOCKET_EVENTS } from '../socket/events';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse';
import { money, toNumber } from '../utils/serialize';
import {
  addOrderItemsSchema,
  assignChefSchema,
  createOrderSchema,
  orderQuerySchema,
  settleOrderSchema,
  updateOrderItemStatusSchema,
  updateOrderStatusSchema,
} from '../validators/orders';

const OPEN_STATUSES = ['pending', 'cooking', 'ready', 'served'] as const;

interface OrderItemDto {
  id: string;
  menuItemId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  status: OrderItemRow['status'];
  notes: string | null;
  prepTimeMinutes: number;
  startedAt: string | null;
  readyAt: string | null;
}

interface OrderDto {
  id: string;
  orderNumber: string;
  type: OrderRow['type'];
  status: OrderRow['status'];
  priority: OrderRow['priority'];
  tableId: string | null;
  tableLabel: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  waiterId: string | null;
  waiterName: string | null;
  chefId: string | null;
  chefName: string | null;
  guestCount: number;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
  paymentMethod: OrderRow['paymentMethod'];
  paymentStatus: OrderRow['paymentStatus'];
  deliveryAddress: string | null;
  notes: string | null;
  cancelReason: string | null;
  placedAt: string;
  cookingStartedAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  completedAt: string | null;
  elapsedMinutes: number;
  items: OrderItemDto[];
}

interface OrderJoins {
  tableLabel?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  waiterName?: string | null;
  chefName?: string | null;
}

function toOrderItemDto(row: OrderItemRow): OrderItemDto {
  return {
    id: row.id,
    menuItemId: row.menuItemId,
    name: row.nameSnapshot,
    unitPrice: toNumber(row.unitPrice),
    quantity: row.quantity,
    lineTotal: toNumber(row.lineTotal),
    status: row.status,
    notes: row.notes,
    prepTimeMinutes: row.prepTimeMinutes,
    startedAt: row.startedAt?.toISOString() ?? null,
    readyAt: row.readyAt?.toISOString() ?? null,
  };
}

function toOrderDto(row: OrderRow, joins: OrderJoins = {}, items: OrderItemRow[] = []): OrderDto {
  const finishedAt = row.completedAt ?? row.cancelledAt;
  const elapsedMs = (finishedAt ?? new Date()).getTime() - row.placedAt.getTime();

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    type: row.type,
    status: row.status,
    priority: row.priority,
    tableId: row.tableId,
    tableLabel: joins.tableLabel ?? null,
    customerId: row.customerId,
    customerName: joins.customerName ?? null,
    customerPhone: joins.customerPhone ?? null,
    waiterId: row.waiterId,
    waiterName: joins.waiterName ?? null,
    chefId: row.chefId,
    chefName: joins.chefName ?? null,
    guestCount: row.guestCount,
    subtotal: toNumber(row.subtotal),
    taxAmount: toNumber(row.taxAmount),
    discountAmount: toNumber(row.discountAmount),
    total: toNumber(row.total),
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    deliveryAddress: row.deliveryAddress,
    notes: row.notes,
    cancelReason: row.cancelReason,
    placedAt: row.placedAt.toISOString(),
    cookingStartedAt: row.cookingStartedAt?.toISOString() ?? null,
    readyAt: row.readyAt?.toISOString() ?? null,
    servedAt: row.servedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    elapsedMinutes: Math.max(0, Math.round(elapsedMs / 60_000)),
    items: items.map(toOrderItemDto),
  };
}

// `users` is joined twice on an order (waiter and chef), so each needs its own alias.
const waiterAlias = alias(users, 'waiter_user');
const chefAlias = alias(users, 'chef_user');

/** Loads one order with every joined label and its line items. */
async function loadOrderDto(orderId: string): Promise<OrderDto> {
  const [row] = await db
    .select({
      order: orders,
      tableLabel: restaurantTables.label,
      customerName: customers.name,
      customerPhone: customers.phone,
      waiterName: waiterAlias.name,
      chefName: chefAlias.name,
    })
    .from(orders)
    .leftJoin(restaurantTables, eq(orders.tableId, restaurantTables.id))
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .leftJoin(waiterAlias, eq(orders.waiterId, waiterAlias.id))
    .leftJoin(chefAlias, eq(orders.chefId, chefAlias.id))
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!row) throw ApiError.notFound('Order');

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId))
    .orderBy(asc(orderItems.createdAt));

  return toOrderDto(row.order, row, items);
}

export const listOrders = asyncHandler(async (req: Request, res: Response) => {
  const query = orderQuerySchema.parse(req.query);

  const filters: SQL[] = [];
  if (query.status) filters.push(eq(orders.status, query.status));
  if (query.type) filters.push(eq(orders.type, query.type));
  if (query.tableId) filters.push(eq(orders.tableId, query.tableId));
  if (query.waiterId) filters.push(eq(orders.waiterId, query.waiterId));
  if (query.customerId) filters.push(eq(orders.customerId, query.customerId));
  if (query.paymentStatus) filters.push(eq(orders.paymentStatus, query.paymentStatus));
  if (query.from) filters.push(gte(orders.placedAt, query.from));
  if (query.to) filters.push(lte(orders.placedAt, query.to));

  if (query.search) {
    const term = `%${query.search}%`;
    const searchCondition = or(
      ilike(orders.orderNumber, term),
      ilike(customers.name, term),
      ilike(customers.phone, term),
      ilike(restaurantTables.label, term),
    );
    if (searchCondition) filters.push(searchCondition);
  }

  const where = filters.length ? and(...filters) : undefined;
  const direction = query.sortOrder === 'asc' ? asc : desc;
  const offset = (query.page - 1) * query.limit;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        order: orders,
        tableLabel: restaurantTables.label,
        customerName: customers.name,
        customerPhone: customers.phone,
        waiterName: users.name,
      })
      .from(orders)
      .leftJoin(restaurantTables, eq(orders.tableId, restaurantTables.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .leftJoin(users, eq(orders.waiterId, users.id))
      .where(where)
      .orderBy(direction(orders.placedAt))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(orders)
      .leftJoin(restaurantTables, eq(orders.tableId, restaurantTables.id))
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(where),
  ]);

  const orderIds = rows.map((row) => row.order.id);
  const items = orderIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    : [];

  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const item of items) {
    const bucket = itemsByOrder.get(item.orderId) ?? [];
    bucket.push(item);
    itemsByOrder.set(item.orderId, bucket);
  }

  sendSuccess(
    res,
    rows.map((row) => toOrderDto(row.order, row, itemsByOrder.get(row.order.id) ?? [])),
    'Orders loaded',
    200,
    buildPaginationMeta(query.page, query.limit, total),
  );
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const dto = await loadOrderDto(req.params.id as string);
  sendSuccess(res, dto, 'Order loaded');
});

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = createOrderSchema.parse(req.body);

  // ── Resolve the dishes and price them from the live menu ──────────────
  const menuItemIds = [...new Set(input.items.map((item) => item.menuItemId))];
  const dishes = await db.select().from(menuItems).where(inArray(menuItems.id, menuItemIds));

  if (dishes.length !== menuItemIds.length) {
    throw ApiError.badRequest('One or more dishes on this order no longer exist');
  }

  const unavailable = dishes.filter((dish) => !dish.isAvailable);
  if (unavailable.length > 0) {
    throw ApiError.badRequest(
      `${unavailable.map((dish) => dish.name).join(', ')} ${
        unavailable.length === 1 ? 'is' : 'are'
      } marked unavailable.`,
    );
  }

  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));

  const lines: PricedLine[] = input.items.map((item) => {
    const dish = dishById.get(item.menuItemId);
    if (!dish) throw ApiError.badRequest('That dish no longer exists');
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

  // ── Resolve the table ─────────────────────────────────────────────────
  let tableLabel: string | null = null;
  if (input.tableId) {
    const [table] = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.id, input.tableId))
      .limit(1);

    if (!table) throw ApiError.badRequest('That table does not exist');

    const [openOrder] = await db
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(and(eq(orders.tableId, table.id), inArray(orders.status, [...OPEN_STATUSES])))
      .limit(1);

    if (openOrder) {
      throw ApiError.conflict(
        `Table ${table.label} already has open order ${openOrder.orderNumber}. Add items to it instead.`,
      );
    }
    tableLabel = table.label;
  }

  // ── Resolve or create the customer ────────────────────────────────────
  let customerId = input.customerId ?? null;
  let customerName: string | null = null;

  if (!customerId && input.customerPhone) {
    const [existing] = await db
      .select()
      .from(customers)
      .where(eq(customers.phone, input.customerPhone))
      .limit(1);

    if (existing) {
      customerId = existing.id;
      customerName = existing.name;
    } else {
      const [created] = await db
        .insert(customers)
        .values({
          name: input.customerName ?? 'Guest',
          phone: input.customerPhone,
          firstVisitAt: new Date(),
        })
        .returning();
      customerId = created?.id ?? null;
      customerName = created?.name ?? null;
    }
  } else if (customerId) {
    const [existing] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    customerName = existing?.name ?? null;
  }

  const totals = await calculateTotals(lines, input.discountAmount);

  // ── Persist ───────────────────────────────────────────────────────────
  const created = await db.transaction(async (tx) => {
    let orderRow: OrderRow | undefined;

    // The per-day counter can collide under concurrency; retry on conflict.
    for (let attempt = 0; attempt < 5 && !orderRow; attempt += 1) {
      const orderNumber = await generateOrderNumber();
      const suffixed =
        attempt === 0 ? orderNumber : `${orderNumber}-${String(attempt).padStart(2, '0')}`;

      const inserted = await tx
        .insert(orders)
        .values({
          orderNumber: suffixed,
          type: input.type,
          status: 'pending',
          priority: input.priority,
          tableId: input.tableId ?? null,
          customerId,
          waiterId: input.waiterId ?? user.id,
          guestCount: input.guestCount,
          subtotal: String(totals.subtotal),
          taxAmount: String(totals.taxAmount),
          discountAmount: String(totals.discountAmount),
          total: String(totals.total),
          deliveryAddress: input.deliveryAddress || null,
          notes: input.notes || null,
        })
        .onConflictDoNothing({ target: orders.orderNumber })
        .returning();

      orderRow = inserted[0];
    }

    if (!orderRow) throw ApiError.internal('Could not allocate an order number. Please retry.');

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

    if (input.tableId) {
      await tx
        .update(restaurantTables)
        .set({
          status: 'occupied',
          assignedWaiterId: input.waiterId ?? user.id,
          updatedAt: new Date(),
        })
        .where(eq(restaurantTables.id, input.tableId));
    }

    return orderRow;
  });

  const dto = await loadOrderDto(created.id);

  realtime.toKitchen(SOCKET_EVENTS.ORDER_CREATED, dto);
  realtime.toFloor(SOCKET_EVENTS.ORDER_CREATED, dto);

  await notifyRoles(['chef', 'kitchen_staff'], {
    type: 'order_created',
    title: `New order ${dto.orderNumber}`,
    message: `${dto.items.length} item${dto.items.length === 1 ? '' : 's'}${
      tableLabel ? ` for table ${tableLabel}` : ` (${dto.type.replace('_', ' ')})`
    }`,
    link: `/kitchen`,
    payload: { orderId: dto.id },
  });

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'order.created',
    entityType: 'order',
    entityId: created.id,
    description: `${user.name} placed order ${created.orderNumber}${
      tableLabel ? ` for table ${tableLabel}` : ''
    }`,
    metadata: { total: totals.total, itemCount: lines.length, customerName },
  });

  sendCreated(res, dto, `Order ${created.orderNumber} placed`);
});

export const updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = updateOrderStatusSchema.parse(req.body);
  const id = req.params.id as string;

  const [existing] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!existing) throw ApiError.notFound('Order');

  assertTransitionAllowed(existing.status, input.status);

  if (input.status === 'cancelled' && !input.cancelReason) {
    throw ApiError.badRequest('Give a reason for cancelling this order');
  }

  const now = new Date();

  const [updated] = await db
    .update(orders)
    .set({
      status: input.status,
      ...timestampsForStatus(input.status, now),
      ...(input.cancelReason ? { cancelReason: input.cancelReason } : {}),
      ...(input.status === 'cooking' && !existing.chefId ? { chefId: user.id } : {}),
      updatedAt: now,
    })
    .where(eq(orders.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Order');

  // Keep line items in step with the order-level status.
  if (input.status === 'cooking') {
    await db
      .update(orderItems)
      .set({ status: 'cooking', startedAt: now })
      .where(and(eq(orderItems.orderId, id), eq(orderItems.status, 'queued')));
  } else if (input.status === 'ready') {
    await db
      .update(orderItems)
      .set({ status: 'ready', readyAt: now })
      .where(and(eq(orderItems.orderId, id), inArray(orderItems.status, ['queued', 'cooking'])));
  } else if (input.status === 'cancelled') {
    await db
      .update(orderItems)
      .set({ status: 'cancelled' })
      .where(and(eq(orderItems.orderId, id), sql`${orderItems.status} <> 'served'`));
  }

  // Terminal states release the table and settle side effects.
  if (input.status === 'completed' || input.status === 'cancelled') {
    if (updated.tableId) {
      await db
        .update(restaurantTables)
        .set({
          status: input.status === 'completed' ? 'cleaning' : 'available',
          assignedWaiterId: null,
          updatedAt: now,
        })
        .where(eq(restaurantTables.id, updated.tableId));
    }

    if (input.status === 'completed') {
      await consumeInventoryForOrder(id, user.id);
      if (updated.customerId) {
        await applyOrderToCustomer(updated.customerId, toNumber(updated.total));
      }
    }
  }

  const dto = await loadOrderDto(id);

  const eventName =
    input.status === 'ready'
      ? SOCKET_EVENTS.ORDER_READY
      : input.status === 'completed'
        ? SOCKET_EVENTS.ORDER_COMPLETED
        : input.status === 'cancelled'
          ? SOCKET_EVENTS.ORDER_CANCELLED
          : SOCKET_EVENTS.ORDER_UPDATED;

  realtime.toKitchen(eventName, dto);
  realtime.toFloor(eventName, dto);

  if (input.status === 'ready') {
    await notifyRoles(['waiter', 'manager'], {
      type: 'order_ready',
      title: `Order ${dto.orderNumber} is ready`,
      message: dto.tableLabel
        ? `Table ${dto.tableLabel} — ready to serve`
        : `${dto.type.replace('_', ' ')} — ready for pickup`,
      link: '/orders',
      payload: { orderId: dto.id },
    });
  }

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: `order.${input.status}`,
    entityType: 'order',
    entityId: id,
    description: `${user.name} marked order ${updated.orderNumber} as ${input.status}`,
    metadata: { from: existing.status, to: input.status, total: toNumber(updated.total) },
  });

  sendSuccess(res, dto, `Order ${updated.orderNumber} is now ${input.status}`);
});

export const updateOrderItemStatus = asyncHandler(async (req: Request, res: Response) => {
  const input = updateOrderItemStatusSchema.parse(req.body);
  const itemId = req.params.itemId as string;
  const now = new Date();

  const [updated] = await db
    .update(orderItems)
    .set({
      status: input.status,
      ...(input.status === 'cooking' ? { startedAt: now } : {}),
      ...(input.status === 'ready' ? { readyAt: now } : {}),
    })
    .where(eq(orderItems.id, itemId))
    .returning();

  if (!updated) throw ApiError.notFound('Order item');

  // When every line is ready, lift the whole order to ready automatically.
  const siblings = await db
    .select({ status: orderItems.status })
    .from(orderItems)
    .where(eq(orderItems.orderId, updated.orderId));

  const active = siblings.filter((item) => item.status !== 'cancelled');
  const allReady = active.length > 0 && active.every((item) => item.status === 'ready');

  if (allReady) {
    const [order] = await db.select().from(orders).where(eq(orders.id, updated.orderId)).limit(1);
    if (order && (order.status === 'cooking' || order.status === 'pending')) {
      await db
        .update(orders)
        .set({ status: 'ready', readyAt: now, updatedAt: now })
        .where(eq(orders.id, updated.orderId));
    }
  }

  const dto = await loadOrderDto(updated.orderId);
  realtime.toKitchen(allReady ? SOCKET_EVENTS.ORDER_READY : SOCKET_EVENTS.ORDER_ITEM_UPDATED, dto);
  realtime.toFloor(allReady ? SOCKET_EVENTS.ORDER_READY : SOCKET_EVENTS.ORDER_ITEM_UPDATED, dto);

  sendSuccess(res, dto, allReady ? 'Every dish is ready' : 'Dish updated');
});

export const addOrderItems = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = addOrderItemsSchema.parse(req.body);
  const id = req.params.id as string;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) throw ApiError.notFound('Order');
  if (!OPEN_STATUSES.includes(order.status as (typeof OPEN_STATUSES)[number])) {
    throw ApiError.badRequest(`Cannot add dishes to an order that is ${order.status}`);
  }

  const menuItemIds = [...new Set(input.items.map((item) => item.menuItemId))];
  const dishes = await db.select().from(menuItems).where(inArray(menuItems.id, menuItemIds));
  const dishById = new Map(dishes.map((dish) => [dish.id, dish]));

  const rows = input.items.map((item) => {
    const dish = dishById.get(item.menuItemId);
    if (!dish) throw ApiError.badRequest('One of those dishes no longer exists');
    if (!dish.isAvailable) throw ApiError.badRequest(`${dish.name} is marked unavailable`);
    const unitPrice = toNumber(dish.price);
    return {
      orderId: id,
      menuItemId: dish.id,
      nameSnapshot: dish.name,
      unitPrice: String(unitPrice),
      quantity: item.quantity,
      lineTotal: String(money(unitPrice * item.quantity)),
      prepTimeMinutes: dish.prepTimeMinutes,
      notes: item.notes || null,
    };
  });

  await db.insert(orderItems).values(rows);
  await recalculateOrderTotals(id);

  // New dishes reopen the kitchen work for an order already plated.
  if (order.status === 'ready' || order.status === 'served') {
    await db
      .update(orders)
      .set({ status: 'cooking', readyAt: null, updatedAt: new Date() })
      .where(eq(orders.id, id));
  }

  const dto = await loadOrderDto(id);
  realtime.toKitchen(SOCKET_EVENTS.ORDER_UPDATED, dto);
  realtime.toFloor(SOCKET_EVENTS.ORDER_UPDATED, dto);

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'order.items_added',
    entityType: 'order',
    entityId: id,
    description: `${user.name} added ${rows.length} dish${rows.length === 1 ? '' : 'es'} to ${order.orderNumber}`,
  });

  sendSuccess(res, dto, 'Dishes added to the order');
});

export const removeOrderItem = asyncHandler(async (req: Request, res: Response) => {
  const orderId = req.params.id as string;
  const itemId = req.params.itemId as string;

  const [item] = await db.select().from(orderItems).where(eq(orderItems.id, itemId)).limit(1);
  if (!item || item.orderId !== orderId) throw ApiError.notFound('Order item');
  if (item.status === 'served') {
    throw ApiError.badRequest('A dish that has already been served cannot be removed');
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orderItems)
    .where(and(eq(orderItems.orderId, orderId), sql`${orderItems.status} <> 'cancelled'`));

  if (count <= 1) {
    throw ApiError.badRequest('An order must keep at least one dish. Cancel the order instead.');
  }

  await db.delete(orderItems).where(eq(orderItems.id, itemId));
  await recalculateOrderTotals(orderId);

  const dto = await loadOrderDto(orderId);
  realtime.toKitchen(SOCKET_EVENTS.ORDER_UPDATED, dto);
  realtime.toFloor(SOCKET_EVENTS.ORDER_UPDATED, dto);

  sendSuccess(res, dto, 'Dish removed');
});

export const assignChef = asyncHandler(async (req: Request, res: Response) => {
  const input = assignChefSchema.parse(req.body);
  const id = req.params.id as string;

  if (input.chefId) {
    const [chef] = await db
      .select({ role: users.role, name: users.name })
      .from(users)
      .where(eq(users.id, input.chefId))
      .limit(1);
    if (!chef) throw ApiError.badRequest('That staff member does not exist');
    if (!['chef', 'kitchen_staff', 'manager', 'owner'].includes(chef.role)) {
      throw ApiError.badRequest(`${chef.name} does not work in the kitchen`);
    }
  }

  const [updated] = await db
    .update(orders)
    .set({ chefId: input.chefId, updatedAt: new Date() })
    .where(eq(orders.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Order');

  const dto = await loadOrderDto(id);
  realtime.toKitchen(SOCKET_EVENTS.ORDER_UPDATED, dto);

  sendSuccess(res, dto, input.chefId ? 'Chef assigned' : 'Chef unassigned');
});

/** Takes payment and closes the bill. */
export const settleOrder = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = settleOrderSchema.parse(req.body);
  const id = req.params.id as string;

  const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!order) throw ApiError.notFound('Order');
  if (order.paymentStatus === 'paid') throw ApiError.conflict('This order has already been paid');
  if (order.status === 'cancelled') throw ApiError.badRequest('A cancelled order cannot be paid');

  const now = new Date();

  if (input.discountAmount !== undefined) {
    await db
      .update(orders)
      .set({ discountAmount: String(input.discountAmount), updatedAt: now })
      .where(eq(orders.id, id));
    await recalculateOrderTotals(id);
  }

  const [settled] = await db
    .update(orders)
    .set({
      paymentMethod: input.paymentMethod,
      paymentStatus: 'paid',
      status: 'completed',
      completedAt: now,
      ...(order.servedAt ? {} : { servedAt: now }),
      updatedAt: now,
    })
    .where(eq(orders.id, id))
    .returning();

  if (!settled) throw ApiError.notFound('Order');

  await db
    .update(orderItems)
    .set({ status: 'served' })
    .where(and(eq(orderItems.orderId, id), sql`${orderItems.status} <> 'cancelled'`));

  if (settled.tableId) {
    await db
      .update(restaurantTables)
      .set({ status: 'cleaning', assignedWaiterId: null, updatedAt: now })
      .where(eq(restaurantTables.id, settled.tableId));
  }

  await consumeInventoryForOrder(id, user.id);
  if (settled.customerId) {
    await applyOrderToCustomer(settled.customerId, toNumber(settled.total));
  }

  const dto = await loadOrderDto(id);
  realtime.toFloor(SOCKET_EVENTS.ORDER_COMPLETED, dto);
  realtime.toManagement(SOCKET_EVENTS.ORDER_COMPLETED, dto);

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'order.settled',
    entityType: 'order',
    entityId: id,
    description: `${user.name} settled ${settled.orderNumber} by ${input.paymentMethod}`,
    metadata: { total: toNumber(settled.total), paymentMethod: input.paymentMethod },
  });

  sendSuccess(res, dto, `Order ${settled.orderNumber} settled`);
});

/** Printable bill payload, including the restaurant header from settings. */
export const getBill = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const [dto, settings] = await Promise.all([loadOrderDto(id), getSettings()]);

  sendSuccess(
    res,
    {
      order: dto,
      restaurant: {
        name: settings.restaurantName,
        address: settings.address,
        phone: settings.phone,
        currency: settings.currency,
        currencySymbol: settings.currencySymbol,
      },
      taxRatePercent: settings.taxRatePercent,
      generatedAt: new Date().toISOString(),
    },
    'Bill generated',
  );
});

/**
 * Kitchen Display System feed — every order the kitchen still owes, oldest
 * first, with the delay signal that drives the priority colours.
 */
export const getKitchenQueue = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await db
    .select({
      order: orders,
      tableLabel: restaurantTables.label,
      chefName: users.name,
    })
    .from(orders)
    .leftJoin(restaurantTables, eq(orders.tableId, restaurantTables.id))
    .leftJoin(users, eq(orders.chefId, users.id))
    .where(inArray(orders.status, ['pending', 'cooking', 'ready']))
    .orderBy(asc(orders.placedAt));

  const orderIds = rows.map((row) => row.order.id);
  const items = orderIds.length
    ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
    : [];

  const itemsByOrder = new Map<string, OrderItemRow[]>();
  for (const item of items) {
    const bucket = itemsByOrder.get(item.orderId) ?? [];
    bucket.push(item);
    itemsByOrder.set(item.orderId, bucket);
  }

  const now = Date.now();

  const tickets = rows.map((row) => {
    const orderItemRows = itemsByOrder.get(row.order.id) ?? [];
    const dto = toOrderDto(row.order, row, orderItemRows);

    // The longest prep time on the ticket is when the whole order should land.
    const expectedMinutes = orderItemRows.reduce(
      (longest, item) => Math.max(longest, item.prepTimeMinutes),
      0,
    );
    const elapsedMinutes = Math.round((now - row.order.placedAt.getTime()) / 60_000);
    const overdueMinutes = Math.max(0, elapsedMinutes - expectedMinutes);

    return {
      ...dto,
      expectedMinutes,
      elapsedMinutes,
      overdueMinutes,
      // Green on time, amber closing in, red overdue.
      heat:
        overdueMinutes > 0 ? 'red' : elapsedMinutes >= expectedMinutes * 0.7 ? 'amber' : 'green',
    };
  });

  sendSuccess(
    res,
    {
      tickets,
      summary: {
        total: tickets.length,
        pending: tickets.filter((ticket) => ticket.status === 'pending').length,
        cooking: tickets.filter((ticket) => ticket.status === 'cooking').length,
        ready: tickets.filter((ticket) => ticket.status === 'ready').length,
        overdue: tickets.filter((ticket) => ticket.overdueMinutes > 0).length,
      },
    },
    'Kitchen queue loaded',
  );
});
