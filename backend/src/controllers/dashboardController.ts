import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import {
  activityLogs,
  customers,
  feedback,
  ingredients,
  orderItems,
  orders,
  reservations,
  restaurantTables,
} from '../db/schema';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysAgo(count: number): Date {
  const date = startOfToday();
  date.setDate(date.getDate() - count);
  return date;
}

/** Percentage change, guarding the divide-by-zero case sensibly. */
function trend(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export const getOverview = asyncHandler(async (_req: Request, res: Response) => {
  const today = startOfToday();
  const yesterday = daysAgo(1);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [
    [todayStats],
    [yesterdayStats],
    [customerStats],
    [reservationStats],
    [inventoryStats],
    [kitchenStats],
    [tableStats],
    [ratingStats],
  ] = await Promise.all([
    db
      .select({
        revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)::float`,
        orderCount: sql<number>`count(*)::int`,
        completedCount: sql<number>`count(*) filter (where ${orders.status} = 'completed')::int`,
        cancelledCount: sql<number>`count(*) filter (where ${orders.status} = 'cancelled')::int`,
        averageOrderValue: sql<number>`coalesce(round(avg(${orders.total}) filter (where ${orders.status} = 'completed'), 2), 0)::float`,
        guestCount: sql<number>`coalesce(sum(${orders.guestCount}), 0)::int`,
      })
      .from(orders)
      .where(gte(orders.placedAt, today)),

    db
      .select({
        revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)::float`,
        orderCount: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(and(gte(orders.placedAt, yesterday), lt(orders.placedAt, today))),

    db
      .select({
        total: sql<number>`count(*)::int`,
        // Inside a raw `filter (where ...)` fragment there is no column-type
        // context, so a bare Date cannot be serialised by the driver. Pass an
        // ISO string and cast it explicitly.
        newToday: sql<number>`count(*) filter (where ${customers.createdAt} >= ${today.toISOString()}::timestamptz)::int`,
        returning: sql<number>`count(*) filter (where ${customers.visitCount} > 1)::int`,
      })
      .from(customers),

    db
      .select({
        todayTotal: sql<number>`count(*)::int`,
        upcoming: sql<number>`count(*) filter (where ${reservations.status} in ('pending','confirmed'))::int`,
        seated: sql<number>`count(*) filter (where ${reservations.status} = 'seated')::int`,
      })
      .from(reservations)
      .where(and(gte(reservations.reservedFor, today), lt(reservations.reservedFor, tomorrow))),

    db
      .select({
        lowStock: sql<number>`count(*) filter (where ${ingredients.minStock} > 0 and ${ingredients.currentStock} <= ${ingredients.minStock})::int`,
        outOfStock: sql<number>`count(*) filter (where ${ingredients.currentStock} <= 0)::int`,
        expiringSoon: sql<number>`count(*) filter (where ${ingredients.expiryDate} is not null and ${ingredients.expiryDate} <= current_date + interval '7 days')::int`,
      })
      .from(ingredients)
      .where(eq(ingredients.isActive, true)),

    db
      .select({
        activeTickets: sql<number>`count(*)::int`,
        // A ticket is "delayed" once it has been open more than 25 minutes.
        delayedTickets: sql<number>`count(*) filter (where ${orders.placedAt} < now() - interval '25 minutes')::int`,
        averageWaitMinutes: sql<number>`coalesce(round(avg(extract(epoch from (now() - ${orders.placedAt})) / 60))::int, 0)`,
      })
      .from(orders)
      .where(inArray(orders.status, ['pending', 'cooking'])),

    db
      .select({
        total: sql<number>`count(*)::int`,
        occupied: sql<number>`count(*) filter (where ${restaurantTables.status} = 'occupied')::int`,
        available: sql<number>`count(*) filter (where ${restaurantTables.status} = 'available')::int`,
      })
      .from(restaurantTables)
      .where(eq(restaurantTables.isActive, true)),

    db
      .select({
        averageRating: sql<number>`coalesce(round(avg(${feedback.rating}), 2), 0)::float`,
        reviewCount: sql<number>`count(*)::int`,
      })
      .from(feedback)
      .where(gte(feedback.createdAt, daysAgo(30))),
  ]);

  const revenue = todayStats?.revenue ?? 0;
  const orderCount = todayStats?.orderCount ?? 0;

  sendSuccess(
    res,
    {
      revenue: {
        value: Math.round(revenue * 100) / 100,
        trend: trend(revenue, yesterdayStats?.revenue ?? 0),
        averageOrderValue: todayStats?.averageOrderValue ?? 0,
      },
      orders: {
        value: orderCount,
        trend: trend(orderCount, yesterdayStats?.orderCount ?? 0),
        completed: todayStats?.completedCount ?? 0,
        cancelled: todayStats?.cancelledCount ?? 0,
        guests: todayStats?.guestCount ?? 0,
      },
      customers: {
        total: customerStats?.total ?? 0,
        newToday: customerStats?.newToday ?? 0,
        returning: customerStats?.returning ?? 0,
      },
      reservations: {
        today: reservationStats?.todayTotal ?? 0,
        upcoming: reservationStats?.upcoming ?? 0,
        seated: reservationStats?.seated ?? 0,
      },
      inventory: {
        lowStock: inventoryStats?.lowStock ?? 0,
        outOfStock: inventoryStats?.outOfStock ?? 0,
        expiringSoon: inventoryStats?.expiringSoon ?? 0,
      },
      kitchen: {
        activeTickets: kitchenStats?.activeTickets ?? 0,
        delayedTickets: kitchenStats?.delayedTickets ?? 0,
        averageWaitMinutes: kitchenStats?.averageWaitMinutes ?? 0,
      },
      tables: {
        total: tableStats?.total ?? 0,
        occupied: tableStats?.occupied ?? 0,
        available: tableStats?.available ?? 0,
        occupancyRate:
          (tableStats?.total ?? 0) > 0
            ? Math.round(((tableStats?.occupied ?? 0) / (tableStats?.total ?? 1)) * 100)
            : 0,
      },
      satisfaction: {
        averageRating: ratingStats?.averageRating ?? 0,
        reviewCount: ratingStats?.reviewCount ?? 0,
      },
    },
    'Dashboard loaded',
  );
});

/** Revenue and order counts bucketed by day for the main dashboard chart. */
export const getRevenueChart = asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
  const from = daysAgo(days - 1);

  const rows = await db
    .select({
      day: sql<string>`to_char(${orders.placedAt}, 'YYYY-MM-DD')`,
      revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)::float`,
      orderCount: sql<number>`count(*)::int`,
      guests: sql<number>`coalesce(sum(${orders.guestCount}), 0)::int`,
    })
    .from(orders)
    .where(gte(orders.placedAt, from))
    .groupBy(sql`to_char(${orders.placedAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${orders.placedAt}, 'YYYY-MM-DD')`);

  // Fill gaps so the chart never shows a broken line on a quiet day.
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const series: { date: string; revenue: number; orders: number; guests: number }[] = [];

  for (let index = 0; index < days; index += 1) {
    const date = new Date(from);
    date.setDate(date.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    const row = byDay.get(key);
    series.push({
      date: key,
      revenue: Math.round((row?.revenue ?? 0) * 100) / 100,
      orders: row?.orderCount ?? 0,
      guests: row?.guests ?? 0,
    });
  }

  sendSuccess(res, series, 'Revenue chart loaded');
});

export const getPopularDishes = asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 25);

  const rows = await db
    .select({
      menuItemId: orderItems.menuItemId,
      name: orderItems.nameSnapshot,
      quantitySold: sql<number>`sum(${orderItems.quantity})::int`,
      revenue: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)::float`,
      orderCount: sql<number>`count(distinct ${orderItems.orderId})::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        gte(orders.placedAt, daysAgo(days)),
        sql`${orders.status} <> 'cancelled'`,
        sql`${orderItems.status} <> 'cancelled'`,
      ),
    )
    .groupBy(orderItems.menuItemId, orderItems.nameSnapshot)
    .orderBy(desc(sql`sum(${orderItems.quantity})`))
    .limit(limit);

  sendSuccess(
    res,
    rows.map((row) => ({ ...row, revenue: Math.round(row.revenue * 100) / 100 })),
    'Popular dishes loaded',
  );
});

export const getOrderTypeBreakdown = asyncHandler(async (req: Request, res: Response) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);

  const rows = await db
    .select({
      type: orders.type,
      orderCount: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)::float`,
    })
    .from(orders)
    .where(gte(orders.placedAt, daysAgo(days)))
    .groupBy(orders.type);

  sendSuccess(
    res,
    rows.map((row) => ({ ...row, revenue: Math.round(row.revenue * 100) / 100 })),
    'Order mix loaded',
  );
});

export const getRecentActivity = asyncHandler(async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

  const rows = await db
    .select()
    .from(activityLogs)
    .orderBy(desc(activityLogs.occurredAt))
    .limit(limit);

  sendSuccess(
    res,
    rows.map((row) => ({
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      description: row.description,
      actorName: row.actorName,
      metadata: row.metadata,
      occurredAt: row.occurredAt.toISOString(),
    })),
    'Activity loaded',
  );
});
