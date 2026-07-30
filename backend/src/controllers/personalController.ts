import { and, avg, count, desc, eq, gte, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { attendance, employees, feedback, orderItems, orders, restaurantTables } from '../db/schema';
import { requireUser } from '../middlewares/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { toNumber } from '../utils/serialize';
import { KITCHEN_ROLES } from '../types/roles';

function daysAgo(count: number): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - count);
  return date;
}

/**
 * "My shift" — what a waiter, chef or cashier needs to see about their own
 * work. Deliberately excludes restaurant-wide revenue, which is management's
 * business, and shows their own pay and ratings instead.
 */
export const getMyPerformance = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const isKitchen = KITCHEN_ROLES.includes(user.role) && user.role !== 'manager' && user.role !== 'owner';

  // Kitchen staff are credited through chefId, floor staff through waiterId.
  const ownColumn = isKitchen ? orders.chefId : orders.waiterId;

  const today = daysAgo(0);
  const weekAgo = daysAgo(7);
  const monthAgo = daysAgo(30);

  const [[todayStats], [weekStats], [monthStats], [ratingStats], [employeeRow]] = await Promise.all([
    db
      .select({
        orderCount: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${orders.status} = 'completed')::int`,
        revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)::float`,
        guests: sql<number>`coalesce(sum(${orders.guestCount}), 0)::int`,
      })
      .from(orders)
      .where(and(eq(ownColumn, user.id), gte(orders.placedAt, today))),

    db
      .select({
        orderCount: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)::float`,
      })
      .from(orders)
      .where(and(eq(ownColumn, user.id), gte(orders.placedAt, weekAgo))),

    db
      .select({
        orderCount: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${orders.total}) filter (where ${orders.status} = 'completed'), 0)::float`,
        averageServiceMinutes: sql<number>`
          coalesce(round(avg(
            extract(epoch from (${orders.completedAt} - ${orders.placedAt})) / 60
          ))::int, 0)`,
        averageCookMinutes: sql<number>`
          coalesce(round(avg(
            extract(epoch from (${orders.readyAt} - ${orders.placedAt})) / 60
          ))::int, 0)`,
      })
      .from(orders)
      .where(and(eq(ownColumn, user.id), gte(orders.placedAt, monthAgo))),

    db
      .select({ averageRating: avg(feedback.rating), reviewCount: count(feedback.id) })
      .from(feedback)
      .innerJoin(orders, eq(feedback.orderId, orders.id))
      .where(and(eq(ownColumn, user.id), gte(orders.placedAt, monthAgo))),

    db.select().from(employees).where(eq(employees.userId, user.id)).limit(1),
  ]);

  // Attendance and pay only exist when an HR record is linked to the account.
  let attendanceSummary: {
    presentDays: number;
    totalDays: number;
    rate: number;
    hoursWorked: number;
  } | null = null;

  let recentAttendance: { workDate: string; status: string; hoursWorked: number }[] = [];

  if (employeeRow) {
    const [summary] = await db
      .select({
        presentDays: sql<number>`count(*) filter (where ${attendance.status} in ('present','late'))::int`,
        totalDays: sql<number>`count(*)::int`,
        hoursWorked: sql<number>`coalesce(sum(${attendance.hoursWorked}), 0)::float`,
      })
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, employeeRow.id),
          gte(attendance.workDate, monthAgo.toISOString().slice(0, 10)),
        ),
      );

    attendanceSummary = {
      presentDays: summary?.presentDays ?? 0,
      totalDays: summary?.totalDays ?? 0,
      rate:
        (summary?.totalDays ?? 0) > 0
          ? Math.round(((summary?.presentDays ?? 0) / (summary?.totalDays ?? 1)) * 100)
          : 0,
      hoursWorked: Math.round((summary?.hoursWorked ?? 0) * 10) / 10,
    };

    const rows = await db
      .select({
        workDate: attendance.workDate,
        status: attendance.status,
        hoursWorked: attendance.hoursWorked,
      })
      .from(attendance)
      .where(eq(attendance.employeeId, employeeRow.id))
      .orderBy(desc(attendance.workDate))
      .limit(10);

    recentAttendance = rows.map((row) => ({
      workDate: row.workDate,
      status: row.status,
      hoursWorked: toNumber(row.hoursWorked),
    }));
  }

  const [recentOrders, recentReviews, myTables, topDishes] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        type: orders.type,
        total: orders.total,
        placedAt: orders.placedAt,
        tableLabel: restaurantTables.label,
      })
      .from(orders)
      .leftJoin(restaurantTables, eq(orders.tableId, restaurantTables.id))
      .where(eq(ownColumn, user.id))
      .orderBy(desc(orders.placedAt))
      .limit(8),

    db
      .select({
        id: feedback.id,
        rating: feedback.rating,
        comment: feedback.comment,
        createdAt: feedback.createdAt,
        orderNumber: orders.orderNumber,
      })
      .from(feedback)
      .innerJoin(orders, eq(feedback.orderId, orders.id))
      .where(and(eq(ownColumn, user.id), sql`${feedback.comment} is not null`))
      .orderBy(desc(feedback.createdAt))
      .limit(5),

    isKitchen
      ? Promise.resolve([])
      : db
          .select({
            id: restaurantTables.id,
            label: restaurantTables.label,
            status: restaurantTables.status,
            section: restaurantTables.section,
            capacity: restaurantTables.capacity,
          })
          .from(restaurantTables)
          .where(eq(restaurantTables.assignedWaiterId, user.id))
          .orderBy(restaurantTables.label),

    db
      .select({
        name: orderItems.nameSnapshot,
        quantity: sql<number>`sum(${orderItems.quantity})::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(eq(ownColumn, user.id), gte(orders.placedAt, monthAgo)))
      .groupBy(orderItems.nameSnapshot)
      .orderBy(desc(sql`sum(${orderItems.quantity})`))
      .limit(5),
  ]);

  const averageRating = ratingStats?.averageRating ? Number(ratingStats.averageRating) : null;

  sendSuccess(
    res,
    {
      role: user.role,
      focus: isKitchen ? 'kitchen' : 'floor',
      today: {
        orders: todayStats?.orderCount ?? 0,
        completed: todayStats?.completed ?? 0,
        revenue: Math.round((todayStats?.revenue ?? 0) * 100) / 100,
        guests: todayStats?.guests ?? 0,
      },
      week: {
        orders: weekStats?.orderCount ?? 0,
        revenue: Math.round((weekStats?.revenue ?? 0) * 100) / 100,
      },
      month: {
        orders: monthStats?.orderCount ?? 0,
        revenue: Math.round((monthStats?.revenue ?? 0) * 100) / 100,
        averageServiceMinutes: monthStats?.averageServiceMinutes ?? 0,
        averageCookMinutes: monthStats?.averageCookMinutes ?? 0,
      },
      rating: {
        average: averageRating !== null ? Math.round(averageRating * 10) / 10 : null,
        reviewCount: ratingStats?.reviewCount ?? 0,
      },
      employment: employeeRow
        ? {
            employeeCode: employeeRow.employeeCode,
            position: employeeRow.position,
            department: employeeRow.department,
            monthlySalary: toNumber(employeeRow.monthlySalary),
            hiredAt: employeeRow.hiredAt,
          }
        : null,
      attendance: attendanceSummary,
      recentAttendance,
      myTables,
      topDishes,
      recentOrders: recentOrders.map((row) => ({
        ...row,
        total: toNumber(row.total),
        placedAt: row.placedAt.toISOString(),
      })),
      recentReviews: recentReviews.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    },
    'Your performance loaded',
  );
});
