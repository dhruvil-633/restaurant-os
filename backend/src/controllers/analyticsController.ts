import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import {
  activityLogs,
  feedback,
  ingredients,
  inventoryTransactions,
  menuItems,
  orderItems,
  orders,
} from '../db/schema';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';

function daysAgo(count: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - count);
  return date;
}

function parseRange(req: Request, defaultDays = 30): { from: Date; to: Date } {
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : daysAgo(defaultDays);
  return { from, to };
}

/**
 * 1 — Restaurant Replay
 *
 * Returns the ordered event stream for a window, plus per-minute density, so
 * the client can scrub a timeline and animate the day back.
 */
export const getReplay = asyncHandler(async (req: Request, res: Response) => {
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const from = req.query.from
    ? new Date(String(req.query.from))
    : new Date(to.getTime() - 12 * 60 * 60 * 1000);

  const limit = Math.min(Math.max(Number(req.query.limit) || 500, 1), 2000);

  const [events, buckets] = await Promise.all([
    db
      .select()
      .from(activityLogs)
      .where(and(gte(activityLogs.occurredAt, from), lte(activityLogs.occurredAt, to)))
      .orderBy(asc(activityLogs.occurredAt))
      .limit(limit),

    db
      .select({
        bucket: sql<string>`to_char(date_trunc('hour', ${activityLogs.occurredAt}), 'YYYY-MM-DD"T"HH24:00:00')`,
        eventCount: sql<number>`count(*)::int`,
      })
      .from(activityLogs)
      .where(and(gte(activityLogs.occurredAt, from), lte(activityLogs.occurredAt, to)))
      .groupBy(sql`date_trunc('hour', ${activityLogs.occurredAt})`)
      .orderBy(sql`date_trunc('hour', ${activityLogs.occurredAt})`),
  ]);

  const byCategory = new Map<string, number>();
  for (const event of events) {
    byCategory.set(event.entityType, (byCategory.get(event.entityType) ?? 0) + 1);
  }

  sendSuccess(
    res,
    {
      from: from.toISOString(),
      to: to.toISOString(),
      totalEvents: events.length,
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        description: event.description,
        actorName: event.actorName,
        metadata: event.metadata,
        occurredAt: event.occurredAt.toISOString(),
        // Offset in seconds from the window start — drives the scrubber.
        offsetSeconds: Math.round((event.occurredAt.getTime() - from.getTime()) / 1000),
      })),
      density: buckets.map((bucket) => ({
        timestamp: bucket.bucket,
        eventCount: bucket.eventCount,
      })),
      byCategory: [...byCategory.entries()].map(([entityType, count]) => ({ entityType, count })),
      durationSeconds: Math.round((to.getTime() - from.getTime()) / 1000),
    },
    'Replay loaded',
  );
});

/**
 * 2 — Kitchen Heatmap
 *
 * Where the kitchen loses time: per dish and per hour, comparing how long a
 * dish actually took against the prep time the menu promises.
 */
export const getKitchenHeatmap = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = parseRange(req, 30);

  const [dishRows, hourRows, [overall]] = await Promise.all([
    db
      .select({
        menuItemId: orderItems.menuItemId,
        name: orderItems.nameSnapshot,
        timesCooked: sql<number>`count(*)::int`,
        expectedMinutes: sql<number>`coalesce(round(avg(${orderItems.prepTimeMinutes}))::int, 0)`,
        actualMinutes: sql<number>`
          coalesce(round(avg(
            extract(epoch from (${orderItems.readyAt} - ${orderItems.startedAt})) / 60
          ))::int, 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          gte(orders.placedAt, from),
          lte(orders.placedAt, to),
          sql`${orderItems.startedAt} is not null and ${orderItems.readyAt} is not null`,
        ),
      )
      .groupBy(orderItems.menuItemId, orderItems.nameSnapshot)
      .orderBy(desc(sql`count(*)`))
      .limit(30),

    db
      .select({
        hour: sql<number>`extract(hour from ${orders.placedAt})::int`,
        ticketCount: sql<number>`count(*)::int`,
        averageMinutes: sql<number>`
          coalesce(round(avg(
            extract(epoch from (${orders.readyAt} - ${orders.placedAt})) / 60
          ))::int, 0)`,
      })
      .from(orders)
      .where(
        and(gte(orders.placedAt, from), lte(orders.placedAt, to), sql`${orders.readyAt} is not null`),
      )
      .groupBy(sql`extract(hour from ${orders.placedAt})`)
      .orderBy(sql`extract(hour from ${orders.placedAt})`),

    db
      .select({
        averageMinutes: sql<number>`
          coalesce(round(avg(
            extract(epoch from (${orders.readyAt} - ${orders.placedAt})) / 60
          ))::int, 0)`,
        slowestMinutes: sql<number>`
          coalesce(round(max(
            extract(epoch from (${orders.readyAt} - ${orders.placedAt})) / 60
          ))::int, 0)`,
        ticketCount: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(
        and(gte(orders.placedAt, from), lte(orders.placedAt, to), sql`${orders.readyAt} is not null`),
      ),
  ]);

  /** Green on time, amber up to 50% over, red beyond that. */
  const heatFor = (expected: number, actual: number): 'green' | 'amber' | 'red' => {
    if (expected <= 0 || actual <= 0) return 'green';
    const ratio = actual / expected;
    if (ratio <= 1.1) return 'green';
    if (ratio <= 1.5) return 'amber';
    return 'red';
  };

  const dishes = dishRows.map((row) => {
    const delayMinutes = Math.max(0, row.actualMinutes - row.expectedMinutes);
    return {
      menuItemId: row.menuItemId,
      name: row.name,
      timesCooked: row.timesCooked,
      expectedMinutes: row.expectedMinutes,
      actualMinutes: row.actualMinutes,
      delayMinutes,
      // Total minutes this dish costs the kitchen across the window.
      cumulativeDelayMinutes: delayMinutes * row.timesCooked,
      heat: heatFor(row.expectedMinutes, row.actualMinutes),
    };
  });

  const bottlenecks = [...dishes]
    .filter((dish) => dish.delayMinutes > 0)
    .sort((a, b) => b.cumulativeDelayMinutes - a.cumulativeDelayMinutes)
    .slice(0, 5);

  const busiestHour = hourRows.reduce(
    (slowest, row) => (row.averageMinutes > (slowest?.averageMinutes ?? 0) ? row : slowest),
    hourRows[0],
  );

  sendSuccess(
    res,
    {
      from: from.toISOString(),
      to: to.toISOString(),
      dishes,
      byHour: hourRows.map((row) => ({
        hour: row.hour,
        ticketCount: row.ticketCount,
        averageMinutes: row.averageMinutes,
        heat: row.averageMinutes > 30 ? 'red' : row.averageMinutes > 20 ? 'amber' : 'green',
      })),
      bottlenecks,
      summary: {
        averageMinutes: overall?.averageMinutes ?? 0,
        slowestMinutes: overall?.slowestMinutes ?? 0,
        ticketCount: overall?.ticketCount ?? 0,
        slowestHour: busiestHour?.hour ?? null,
      },
    },
    'Kitchen heatmap loaded',
  );
});

/**
 * 4 — Waste Analytics
 *
 * What was thrown away, what it cost, and why — daily, by reason and by
 * ingredient, plus waste as a share of the food revenue it should have become.
 */
export const getWasteAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = parseRange(req, 30);

  const [[totals], byReason, byIngredient, daily, [revenueRow]] = await Promise.all([
    db
      .select({
        totalQuantity: sql<number>`coalesce(sum(abs(${inventoryTransactions.quantity})), 0)::float`,
        totalValue: sql<number>`coalesce(sum(${inventoryTransactions.totalCost}), 0)::float`,
        incidents: sql<number>`count(*)::int`,
      })
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.type, 'waste'),
          gte(inventoryTransactions.occurredAt, from),
          lte(inventoryTransactions.occurredAt, to),
        ),
      ),

    db
      .select({
        reason: inventoryTransactions.wasteReason,
        value: sql<number>`coalesce(sum(${inventoryTransactions.totalCost}), 0)::float`,
        quantity: sql<number>`coalesce(sum(abs(${inventoryTransactions.quantity})), 0)::float`,
        incidents: sql<number>`count(*)::int`,
      })
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.type, 'waste'),
          gte(inventoryTransactions.occurredAt, from),
          lte(inventoryTransactions.occurredAt, to),
        ),
      )
      .groupBy(inventoryTransactions.wasteReason)
      .orderBy(desc(sql`sum(${inventoryTransactions.totalCost})`)),

    db
      .select({
        ingredientId: inventoryTransactions.ingredientId,
        name: ingredients.name,
        unit: ingredients.unit,
        quantity: sql<number>`coalesce(sum(abs(${inventoryTransactions.quantity})), 0)::float`,
        value: sql<number>`coalesce(sum(${inventoryTransactions.totalCost}), 0)::float`,
        incidents: sql<number>`count(*)::int`,
      })
      .from(inventoryTransactions)
      .innerJoin(ingredients, eq(inventoryTransactions.ingredientId, ingredients.id))
      .where(
        and(
          eq(inventoryTransactions.type, 'waste'),
          gte(inventoryTransactions.occurredAt, from),
          lte(inventoryTransactions.occurredAt, to),
        ),
      )
      .groupBy(inventoryTransactions.ingredientId, ingredients.name, ingredients.unit)
      .orderBy(desc(sql`sum(${inventoryTransactions.totalCost})`))
      .limit(15),

    db
      .select({
        day: sql<string>`to_char(${inventoryTransactions.occurredAt}, 'YYYY-MM-DD')`,
        value: sql<number>`coalesce(sum(${inventoryTransactions.totalCost}), 0)::float`,
        quantity: sql<number>`coalesce(sum(abs(${inventoryTransactions.quantity})), 0)::float`,
      })
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.type, 'waste'),
          gte(inventoryTransactions.occurredAt, from),
          lte(inventoryTransactions.occurredAt, to),
        ),
      )
      .groupBy(sql`to_char(${inventoryTransactions.occurredAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${inventoryTransactions.occurredAt}, 'YYYY-MM-DD')`),

    db
      .select({
        revenue: sql<number>`coalesce(sum(${orders.total}), 0)::float`,
      })
      .from(orders)
      .where(and(eq(orders.status, 'completed'), gte(orders.placedAt, from), lte(orders.placedAt, to))),
  ]);

  const totalValue = Math.round((totals?.totalValue ?? 0) * 100) / 100;
  const revenue = revenueRow?.revenue ?? 0;
  const dayCount = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));

  sendSuccess(
    res,
    {
      from: from.toISOString(),
      to: to.toISOString(),
      summary: {
        totalValue,
        totalQuantity: Math.round((totals?.totalQuantity ?? 0) * 1000) / 1000,
        incidents: totals?.incidents ?? 0,
        averagePerDay: Math.round((totalValue / dayCount) * 100) / 100,
        percentOfRevenue: revenue > 0 ? Math.round((totalValue / revenue) * 1000) / 10 : 0,
        projectedMonthlyLoss: Math.round((totalValue / dayCount) * 30 * 100) / 100,
      },
      byReason: byReason.map((row) => ({
        reason: row.reason ?? 'other',
        value: Math.round(row.value * 100) / 100,
        quantity: Math.round(row.quantity * 1000) / 1000,
        incidents: row.incidents,
        share: totalValue > 0 ? Math.round((row.value / totalValue) * 1000) / 10 : 0,
      })),
      byIngredient: byIngredient.map((row) => ({
        ...row,
        quantity: Math.round(row.quantity * 1000) / 1000,
        value: Math.round(row.value * 100) / 100,
      })),
      daily: daily.map((row) => ({
        date: row.day,
        value: Math.round(row.value * 100) / 100,
        quantity: Math.round(row.quantity * 1000) / 1000,
      })),
    },
    'Waste analytics loaded',
  );
});

/**
 * 5 — Restaurant Health Score
 *
 * A single 0–100 read on the business, weighted across five pillars so one bad
 * area cannot hide behind four good ones.
 */
export const getHealthScore = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = parseRange(req, 30);
  const windowDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86_400_000));

  const previousFrom = new Date(from.getTime() - windowDays * 86_400_000);

  const [[current], [previous], [rating], [kitchen], [stock], [waste]] = await Promise.all([
    db
      .select({
        revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)::float`,
        orderCount: sql<number>`count(*) filter (where ${orders.status} = 'completed')::int`,
        cancelledCount: sql<number>`count(*) filter (where ${orders.status} = 'cancelled')::int`,
        totalCount: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(and(gte(orders.placedAt, from), lte(orders.placedAt, to))),

    db
      .select({
        revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)::float`,
      })
      .from(orders)
      .where(and(gte(orders.placedAt, previousFrom), lte(orders.placedAt, from))),

    db
      .select({
        averageRating: sql<number>`coalesce(avg(${feedback.rating}), 0)::float`,
        reviewCount: sql<number>`count(*)::int`,
      })
      .from(feedback)
      .where(and(gte(feedback.createdAt, from), lte(feedback.createdAt, to))),

    db
      .select({
        averageMinutes: sql<number>`
          coalesce(avg(extract(epoch from (${orders.readyAt} - ${orders.placedAt})) / 60), 0)::float`,
      })
      .from(orders)
      .where(
        and(gte(orders.placedAt, from), lte(orders.placedAt, to), sql`${orders.readyAt} is not null`),
      ),

    db
      .select({
        totalItems: sql<number>`count(*)::int`,
        healthyItems: sql<number>`count(*) filter (where ${ingredients.currentStock} > ${ingredients.minStock})::int`,
      })
      .from(ingredients)
      .where(eq(ingredients.isActive, true)),

    db
      .select({
        wasteValue: sql<number>`coalesce(sum(${inventoryTransactions.totalCost}), 0)::float`,
      })
      .from(inventoryTransactions)
      .where(
        and(
          eq(inventoryTransactions.type, 'waste'),
          gte(inventoryTransactions.occurredAt, from),
          lte(inventoryTransactions.occurredAt, to),
        ),
      ),
  ]);

  const revenue = current?.revenue ?? 0;
  const previousRevenue = previous?.revenue ?? 0;

  // ── Revenue (25): growth against the preceding equal-length window ──
  const growth = previousRevenue > 0 ? (revenue - previousRevenue) / previousRevenue : revenue > 0 ? 0.2 : 0;
  const revenueScore = Math.max(0, Math.min(25, 15 + growth * 50));

  // ── Ratings (25): a 5-star average is full marks ──
  const averageRating = rating?.averageRating ?? 0;
  const ratingScore = averageRating > 0 ? Math.min(25, (averageRating / 5) * 25) : 12.5;

  // ── Kitchen speed (20): 15 min is excellent, 40 min scores zero ──
  const averageMinutes = kitchen?.averageMinutes ?? 0;
  const kitchenScore =
    averageMinutes === 0 ? 10 : Math.max(0, Math.min(20, 20 - ((averageMinutes - 15) / 25) * 20));

  // ── Inventory (15): share of ingredients above their minimum ──
  const totalItems = stock?.totalItems ?? 0;
  const inventoryScore =
    totalItems > 0 ? ((stock?.healthyItems ?? 0) / totalItems) * 15 : 7.5;

  // ── Waste (15): under 2% of revenue is full marks, 10%+ is zero ──
  const wasteValue = waste?.wasteValue ?? 0;
  const wasteRatio = revenue > 0 ? wasteValue / revenue : 0;
  const wasteScore = Math.max(0, Math.min(15, 15 - ((wasteRatio - 0.02) / 0.08) * 15));

  const pillars = [
    {
      key: 'revenue',
      label: 'Revenue growth',
      score: Math.round(revenueScore * 10) / 10,
      max: 25,
      detail: `${growth >= 0 ? '+' : ''}${Math.round(growth * 1000) / 10}% vs previous ${windowDays} days`,
    },
    {
      key: 'ratings',
      label: 'Guest satisfaction',
      score: Math.round(ratingScore * 10) / 10,
      max: 25,
      detail:
        (rating?.reviewCount ?? 0) > 0
          ? `${Math.round(averageRating * 10) / 10} / 5 across ${rating?.reviewCount} reviews`
          : 'No reviews in this period',
    },
    {
      key: 'kitchen',
      label: 'Kitchen speed',
      score: Math.round(kitchenScore * 10) / 10,
      max: 20,
      detail:
        averageMinutes > 0 ? `${Math.round(averageMinutes)} min average ticket` : 'No timed tickets',
    },
    {
      key: 'inventory',
      label: 'Inventory health',
      score: Math.round(inventoryScore * 10) / 10,
      max: 15,
      detail:
        totalItems > 0
          ? `${stock?.healthyItems ?? 0} of ${totalItems} ingredients above minimum`
          : 'No ingredients tracked',
    },
    {
      key: 'waste',
      label: 'Waste control',
      score: Math.round(wasteScore * 10) / 10,
      max: 15,
      detail: `${Math.round(wasteRatio * 1000) / 10}% of revenue lost to waste`,
    },
  ];

  const total = Math.round(pillars.reduce((sum, pillar) => sum + pillar.score, 0));

  const grade =
    total >= 90 ? 'A' : total >= 80 ? 'B' : total >= 70 ? 'C' : total >= 60 ? 'D' : 'F';

  const weakest = [...pillars].sort((a, b) => a.score / a.max - b.score / b.max)[0];

  sendSuccess(
    res,
    {
      from: from.toISOString(),
      to: to.toISOString(),
      score: total,
      grade,
      status:
        total >= 80 ? 'healthy' : total >= 65 ? 'stable' : total >= 50 ? 'needs attention' : 'at risk',
      pillars,
      focusArea: weakest
        ? { key: weakest.key, label: weakest.label, detail: weakest.detail }
        : null,
      context: {
        revenue: Math.round(revenue * 100) / 100,
        previousRevenue: Math.round(previousRevenue * 100) / 100,
        completedOrders: current?.orderCount ?? 0,
        cancellationRate:
          (current?.totalCount ?? 0) > 0
            ? Math.round(((current?.cancelledCount ?? 0) / (current?.totalCount ?? 1)) * 1000) / 10
            : 0,
      },
    },
    'Health score calculated',
  );
});

/**
 * 6 — Peak Hour Analytics
 *
 * A day-of-week by hour grid of revenue and covers, so an owner can see when
 * to add staff and when to close a section.
 */
export const getPeakHours = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = parseRange(req, 60);

  const [grid, byHour, byWeekday] = await Promise.all([
    db
      .select({
        weekday: sql<number>`extract(dow from ${orders.placedAt})::int`,
        hour: sql<number>`extract(hour from ${orders.placedAt})::int`,
        orderCount: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${orders.total}), 0)::float`,
        guests: sql<number>`coalesce(sum(${orders.guestCount}), 0)::int`,
      })
      .from(orders)
      .where(and(gte(orders.placedAt, from), lte(orders.placedAt, to), eq(orders.status, 'completed')))
      .groupBy(sql`extract(dow from ${orders.placedAt})`, sql`extract(hour from ${orders.placedAt})`),

    db
      .select({
        hour: sql<number>`extract(hour from ${orders.placedAt})::int`,
        orderCount: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${orders.total}), 0)::float`,
        averageOrderValue: sql<number>`coalesce(round(avg(${orders.total}), 2), 0)::float`,
      })
      .from(orders)
      .where(and(gte(orders.placedAt, from), lte(orders.placedAt, to), eq(orders.status, 'completed')))
      .groupBy(sql`extract(hour from ${orders.placedAt})`)
      .orderBy(sql`extract(hour from ${orders.placedAt})`),

    db
      .select({
        weekday: sql<number>`extract(dow from ${orders.placedAt})::int`,
        orderCount: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${orders.total}), 0)::float`,
        guests: sql<number>`coalesce(sum(${orders.guestCount}), 0)::int`,
      })
      .from(orders)
      .where(and(gte(orders.placedAt, from), lte(orders.placedAt, to), eq(orders.status, 'completed')))
      .groupBy(sql`extract(dow from ${orders.placedAt})`)
      .orderBy(sql`extract(dow from ${orders.placedAt})`),
  ]);

  const peakCell = grid.reduce(
    (peak, cell) => (cell.revenue > (peak?.revenue ?? 0) ? cell : peak),
    grid[0],
  );
  const peakHour = byHour.reduce(
    (peak, cell) => (cell.revenue > (peak?.revenue ?? 0) ? cell : peak),
    byHour[0],
  );
  const peakDay = byWeekday.reduce(
    (peak, cell) => (cell.revenue > (peak?.revenue ?? 0) ? cell : peak),
    byWeekday[0],
  );
  const quietDay = byWeekday.reduce(
    (quiet, cell) => (cell.revenue < (quiet?.revenue ?? Infinity) ? cell : quiet),
    byWeekday[0],
  );

  const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  sendSuccess(
    res,
    {
      from: from.toISOString(),
      to: to.toISOString(),
      grid: grid.map((cell) => ({
        weekday: cell.weekday,
        weekdayName: WEEKDAY_NAMES[cell.weekday] ?? 'Unknown',
        hour: cell.hour,
        orderCount: cell.orderCount,
        revenue: Math.round(cell.revenue * 100) / 100,
        guests: cell.guests,
      })),
      byHour: byHour.map((row) => ({ ...row, revenue: Math.round(row.revenue * 100) / 100 })),
      byWeekday: byWeekday.map((row) => ({
        ...row,
        weekdayName: WEEKDAY_NAMES[row.weekday] ?? 'Unknown',
        revenue: Math.round(row.revenue * 100) / 100,
      })),
      insights: {
        peakSlot: peakCell
          ? {
              weekday: peakCell.weekday,
              weekdayName: WEEKDAY_NAMES[peakCell.weekday] ?? 'Unknown',
              hour: peakCell.hour,
              revenue: Math.round(peakCell.revenue * 100) / 100,
            }
          : null,
        peakHour: peakHour?.hour ?? null,
        busiestDay: peakDay ? WEEKDAY_NAMES[peakDay.weekday] ?? null : null,
        quietestDay: quietDay ? WEEKDAY_NAMES[quietDay.weekday] ?? null : null,
      },
    },
    'Peak hour analytics loaded',
  );
});

/** Menu engineering: which dishes earn, which merely sell. */
export const getMenuPerformance = asyncHandler(async (req: Request, res: Response) => {
  const { from, to } = parseRange(req, 30);

  const rows = await db
    .select({
      menuItemId: orderItems.menuItemId,
      name: orderItems.nameSnapshot,
      quantitySold: sql<number>`sum(${orderItems.quantity})::int`,
      revenue: sql<number>`coalesce(sum(${orderItems.lineTotal}), 0)::float`,
      cost: sql<number>`coalesce(sum(${menuItems.cost} * ${orderItems.quantity}), 0)::float`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orderItems.orderId, orders.id))
    .leftJoin(menuItems, eq(orderItems.menuItemId, menuItems.id))
    .where(
      and(gte(orders.placedAt, from), lte(orders.placedAt, to), sql`${orders.status} <> 'cancelled'`),
    )
    .groupBy(orderItems.menuItemId, orderItems.nameSnapshot)
    .orderBy(desc(sql`sum(${orderItems.lineTotal})`));

  if (rows.length === 0) {
    sendSuccess(res, { items: [], quadrants: { stars: 0, plowhorses: 0, puzzles: 0, dogs: 0 } }, 'Menu performance loaded');
    return;
  }

  const averageVolume = rows.reduce((sum, row) => sum + row.quantitySold, 0) / rows.length;
  const averageMargin =
    rows.reduce((sum, row) => sum + (row.revenue - row.cost), 0) / rows.length;

  const items = rows.map((row) => {
    const profit = row.revenue - row.cost;
    const highVolume = row.quantitySold >= averageVolume;
    const highMargin = profit >= averageMargin;

    // Classic menu-engineering quadrants.
    const quadrant = highVolume
      ? highMargin
        ? 'star'
        : 'plowhorse'
      : highMargin
        ? 'puzzle'
        : 'dog';

    return {
      menuItemId: row.menuItemId,
      name: row.name,
      quantitySold: row.quantitySold,
      revenue: Math.round(row.revenue * 100) / 100,
      cost: Math.round(row.cost * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      marginPercent: row.revenue > 0 ? Math.round((profit / row.revenue) * 1000) / 10 : 0,
      quadrant,
    };
  });

  sendSuccess(
    res,
    {
      from: from.toISOString(),
      to: to.toISOString(),
      items,
      quadrants: {
        stars: items.filter((item) => item.quadrant === 'star').length,
        plowhorses: items.filter((item) => item.quadrant === 'plowhorse').length,
        puzzles: items.filter((item) => item.quadrant === 'puzzle').length,
        dogs: items.filter((item) => item.quadrant === 'dog').length,
      },
    },
    'Menu performance loaded',
  );
});
