import { and, asc, eq, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { orders, restaurantTables, users, type RestaurantTableRow } from '../db/schema';
import { requireUser } from '../middlewares/auth';
import { recordActivity } from '../services/activityLog';
import { realtime } from '../socket';
import { SOCKET_EVENTS } from '../socket/events';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../utils/apiResponse';
import { toNumber } from '../utils/serialize';
import {
  assignWaiterSchema,
  createTableSchema,
  tableQuerySchema,
  updateFloorLayoutSchema,
  updateTableSchema,
  updateTableStatusSchema,
} from '../validators/tables';

/** Statuses that mean an order is still "live" on a table. */
const OPEN_ORDER_STATUSES = ['pending', 'cooking', 'ready', 'served'] as const;

interface TableDto {
  id: string;
  label: string;
  capacity: number;
  section: string;
  status: RestaurantTableRow['status'];
  shape: RestaurantTableRow['shape'];
  positionX: number;
  positionY: number;
  assignedWaiterId: string | null;
  assignedWaiterName: string | null;
  isActive: boolean;
  activeOrder: {
    id: string;
    orderNumber: string;
    status: string;
    total: number;
    guestCount: number;
    placedAt: string;
    minutesSeated: number;
  } | null;
}

function toTableDto(
  row: RestaurantTableRow,
  waiterName: string | null,
  activeOrder: TableDto['activeOrder'],
): TableDto {
  return {
    id: row.id,
    label: row.label,
    capacity: row.capacity,
    section: row.section,
    status: row.status,
    shape: row.shape,
    positionX: toNumber(row.positionX),
    positionY: toNumber(row.positionY),
    assignedWaiterId: row.assignedWaiterId,
    assignedWaiterName: waiterName,
    isActive: row.isActive,
    activeOrder,
  };
}

export const listTables = asyncHandler(async (req: Request, res: Response) => {
  const query = tableQuerySchema.parse(req.query);

  const filters: SQL[] = [eq(restaurantTables.isActive, true)];
  if (query.status) filters.push(eq(restaurantTables.status, query.status));
  if (query.section) filters.push(eq(restaurantTables.section, query.section));

  const rows = await db
    .select({ table: restaurantTables, waiterName: users.name })
    .from(restaurantTables)
    .leftJoin(users, eq(restaurantTables.assignedWaiterId, users.id))
    .where(and(...filters))
    .orderBy(asc(restaurantTables.section), asc(restaurantTables.label));

  // One extra query resolves the live order for every table at once.
  const openOrders = rows.length
    ? await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          total: orders.total,
          guestCount: orders.guestCount,
          placedAt: orders.placedAt,
          tableId: orders.tableId,
        })
        .from(orders)
        .where(
          and(
            inArray(orders.status, [...OPEN_ORDER_STATUSES]),
            inArray(
              orders.tableId,
              rows.map((row) => row.table.id),
            ),
          ),
        )
    : [];

  const orderByTable = new Map(openOrders.map((order) => [order.tableId, order]));
  const now = Date.now();

  sendSuccess(
    res,
    rows.map((row) => {
      const order = orderByTable.get(row.table.id);
      return toTableDto(
        row.table,
        row.waiterName,
        order
          ? {
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              total: toNumber(order.total),
              guestCount: order.guestCount,
              placedAt: order.placedAt.toISOString(),
              minutesSeated: Math.max(
                0,
                Math.round((now - order.placedAt.getTime()) / 60_000),
              ),
            }
          : null,
      );
    }),
    'Floor loaded',
  );
});

export const getTableSections = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await db
    .selectDistinct({ section: restaurantTables.section })
    .from(restaurantTables)
    .orderBy(asc(restaurantTables.section));

  sendSuccess(
    res,
    rows.map((row) => row.section),
    'Sections loaded',
  );
});

export const createTable = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = createTableSchema.parse(req.body);

  const [created] = await db
    .insert(restaurantTables)
    .values({
      label: input.label,
      capacity: input.capacity,
      section: input.section,
      shape: input.shape,
      status: input.status,
      positionX: String(input.positionX),
      positionY: String(input.positionY),
      isActive: input.isActive,
    })
    .returning();

  if (!created) throw ApiError.internal('Could not create the table');

  realtime.toFloor(SOCKET_EVENTS.TABLE_UPDATED, toTableDto(created, null, null));

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'table.created',
    entityType: 'table',
    entityId: created.id,
    description: `${user.name} added table ${created.label}`,
  });

  sendCreated(res, toTableDto(created, null, null), 'Table added');
});

export const updateTable = asyncHandler(async (req: Request, res: Response) => {
  const input = updateTableSchema.parse(req.body);
  const id = req.params.id as string;

  const [updated] = await db
    .update(restaurantTables)
    .set({
      ...(input.label !== undefined ? { label: input.label } : {}),
      ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      ...(input.section !== undefined ? { section: input.section } : {}),
      ...(input.shape !== undefined ? { shape: input.shape } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.positionX !== undefined ? { positionX: String(input.positionX) } : {}),
      ...(input.positionY !== undefined ? { positionY: String(input.positionY) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(restaurantTables.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Table');

  realtime.toFloor(SOCKET_EVENTS.TABLE_UPDATED, toTableDto(updated, null, null));
  sendSuccess(res, toTableDto(updated, null, null), 'Table updated');
});

export const updateTableStatus = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = updateTableStatusSchema.parse(req.body);
  const id = req.params.id as string;

  const [existing] = await db
    .select()
    .from(restaurantTables)
    .where(eq(restaurantTables.id, id))
    .limit(1);
  if (!existing) throw ApiError.notFound('Table');

  // Freeing a table with an unpaid order would strand the bill.
  if (input.status === 'available' && existing.status === 'occupied') {
    const [openOrder] = await db
      .select({ orderNumber: orders.orderNumber })
      .from(orders)
      .where(and(eq(orders.tableId, id), inArray(orders.status, [...OPEN_ORDER_STATUSES])))
      .limit(1);

    if (openOrder) {
      throw ApiError.conflict(
        `Order ${openOrder.orderNumber} is still open on this table. Complete or cancel it first.`,
      );
    }
  }

  const [updated] = await db
    .update(restaurantTables)
    .set({
      status: input.status,
      // A freed table should not stay assigned to last night's waiter.
      ...(input.status === 'available' ? { assignedWaiterId: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(restaurantTables.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Table');

  realtime.toFloor(SOCKET_EVENTS.TABLE_UPDATED, toTableDto(updated, null, null));

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'table.status_changed',
    entityType: 'table',
    entityId: id,
    description: `${user.name} set table ${updated.label} to ${input.status}`,
    metadata: { from: existing.status, to: input.status },
  });

  sendSuccess(res, toTableDto(updated, null, null), `Table ${updated.label} is now ${input.status}`);
});

export const assignWaiter = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = assignWaiterSchema.parse(req.body);
  const id = req.params.id as string;

  let waiterName: string | null = null;

  if (input.waiterId) {
    const [waiter] = await db
      .select({ id: users.id, name: users.name, role: users.role, isActive: users.isActive })
      .from(users)
      .where(eq(users.id, input.waiterId))
      .limit(1);

    if (!waiter) throw ApiError.badRequest('That staff member does not exist');
    if (!waiter.isActive) throw ApiError.badRequest('That staff member is deactivated');
    if (!['waiter', 'manager', 'owner', 'cashier'].includes(waiter.role)) {
      throw ApiError.badRequest(`${waiter.name} is a ${waiter.role} and cannot be assigned to a table`);
    }
    waiterName = waiter.name;
  }

  const [updated] = await db
    .update(restaurantTables)
    .set({ assignedWaiterId: input.waiterId, updatedAt: new Date() })
    .where(eq(restaurantTables.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Table');

  realtime.toFloor(SOCKET_EVENTS.TABLE_UPDATED, toTableDto(updated, waiterName, null));

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'table.waiter_assigned',
    entityType: 'table',
    entityId: id,
    description: waiterName
      ? `${user.name} assigned ${waiterName} to table ${updated.label}`
      : `${user.name} unassigned table ${updated.label}`,
  });

  sendSuccess(
    res,
    toTableDto(updated, waiterName, null),
    waiterName ? `${waiterName} is now serving table ${updated.label}` : 'Waiter unassigned',
  );
});

/** Persists new coordinates after the floor plan is rearranged by dragging. */
export const saveFloorLayout = asyncHandler(async (req: Request, res: Response) => {
  const input = updateFloorLayoutSchema.parse(req.body);

  await db.transaction(async (tx) => {
    for (const entry of input.tables) {
      await tx
        .update(restaurantTables)
        .set({
          positionX: String(entry.positionX),
          positionY: String(entry.positionY),
          updatedAt: new Date(),
        })
        .where(eq(restaurantTables.id, entry.id));
    }
  });

  sendSuccess(res, { updated: input.tables.length }, 'Floor plan saved');
});

export const deleteTable = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const id = req.params.id as string;

  const [openOrder] = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(and(eq(orders.tableId, id), inArray(orders.status, [...OPEN_ORDER_STATUSES])))
    .limit(1);

  if (openOrder) {
    throw ApiError.conflict(`Order ${openOrder.orderNumber} is still open on this table.`);
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.tableId, id));

  // Past orders reference the table, so retire rather than delete.
  if (count > 0) {
    const [archived] = await db
      .update(restaurantTables)
      .set({ isActive: false, status: 'available', assignedWaiterId: null, updatedAt: new Date() })
      .where(eq(restaurantTables.id, id))
      .returning();

    if (!archived) throw ApiError.notFound('Table');
    sendSuccess(res, null, `Table ${archived.label} was removed from the floor plan.`);
    return;
  }

  const [deleted] = await db
    .delete(restaurantTables)
    .where(eq(restaurantTables.id, id))
    .returning();
  if (!deleted) throw ApiError.notFound('Table');

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'table.deleted',
    entityType: 'table',
    entityId: id,
    description: `${user.name} deleted table ${deleted.label}`,
  });

  sendSuccess(res, null, 'Table deleted');
});

/**
 * Smart Wait Time — estimates how long a walk-in party will wait.
 *
 * Combines three signals: how many tables are free right now, how far into
 * their meal the occupied tables are, and how backed up the kitchen is.
 */
export const getWaitTimeEstimate = asyncHandler(async (_req: Request, res: Response) => {
  const [tableRows, [kitchenLoad]] = await Promise.all([
    db
      .select({ status: restaurantTables.status, count: sql<number>`count(*)::int` })
      .from(restaurantTables)
      .where(eq(restaurantTables.isActive, true))
      .groupBy(restaurantTables.status),
    db
      .select({
        pendingOrders: sql<number>`count(*)::int`,
        oldestMinutes: sql<number>`coalesce(round(extract(epoch from (now() - min(${orders.placedAt}))) / 60), 0)::int`,
      })
      .from(orders)
      .where(notInArray(orders.status, ['completed', 'cancelled'])),
  ]);

  const counts = Object.fromEntries(tableRows.map((row) => [row.status, row.count]));
  const available = counts.available ?? 0;
  const occupied = counts.occupied ?? 0;
  const cleaning = counts.cleaning ?? 0;
  const reserved = counts.reserved ?? 0;
  const totalTables = available + occupied + cleaning + reserved;

  const pendingOrders = kitchenLoad?.pendingOrders ?? 0;

  // Average sitting so far tells us roughly how soon a table turns over.
  const [seated] = await db
    .select({
      averageMinutes: sql<number>`coalesce(round(avg(extract(epoch from (now() - ${orders.placedAt})) / 60)), 0)::int`,
    })
    .from(orders)
    .where(inArray(orders.status, [...OPEN_ORDER_STATUSES]));

  const settingsTurnover = 55;
  const averageSeatedMinutes = seated?.averageMinutes ?? 0;

  let estimatedMinutes: number;
  if (available > 0) {
    // Seats are free — the only delay is the kitchen queue.
    estimatedMinutes = Math.min(15, Math.round(pendingOrders * 1.5));
  } else {
    const minutesUntilTurnover = Math.max(5, settingsTurnover - averageSeatedMinutes);
    const cleaningBuffer = cleaning > 0 ? 5 : 0;
    const kitchenPressure = Math.round(pendingOrders * 2);
    estimatedMinutes = minutesUntilTurnover + cleaningBuffer + kitchenPressure;
  }

  const occupancyRate = totalTables > 0 ? Math.round((occupied / totalTables) * 100) : 0;

  sendSuccess(
    res,
    {
      estimatedMinutes: Math.min(estimatedMinutes, 120),
      confidence: totalTables === 0 ? 'low' : available > 0 ? 'high' : occupied > 2 ? 'medium' : 'low',
      occupancyRate,
      breakdown: {
        totalTables,
        available,
        occupied,
        reserved,
        cleaning,
        pendingOrders,
        averageSeatedMinutes,
      },
    },
    'Wait time estimated',
  );
});
