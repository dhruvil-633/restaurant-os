import { and, asc, desc, eq, gte, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import { customers, feedback, orderItems, orders, type CustomerRow } from '../db/schema';
import { requireUser } from '../middlewares/auth';
import { recordActivity } from '../services/activityLog';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse';
import { toNumber } from '../utils/serialize';
import { listQuerySchema } from '../validators/common';
import {
  adjustLoyaltySchema,
  createCustomerSchema,
  updateCustomerSchema,
} from '../validators/people';

function toCustomerDto(row: CustomerRow) {
  const totalSpent = toNumber(row.totalSpent);
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    birthday: row.birthday,
    notes: row.notes,
    loyaltyPoints: row.loyaltyPoints,
    visitCount: row.visitCount,
    totalSpent,
    averageBill: row.visitCount > 0 ? Math.round((totalSpent / row.visitCount) * 100) / 100 : 0,
    firstVisitAt: row.firstVisitAt?.toISOString() ?? null,
    lastVisitAt: row.lastVisitAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const listCustomers = asyncHandler(async (req: Request, res: Response) => {
  const query = listQuerySchema.parse(req.query);

  const filters: SQL[] = [];
  if (query.search) {
    const term = `%${query.search}%`;
    const condition = or(
      ilike(customers.name, term),
      ilike(customers.phone, term),
      ilike(customers.email, term),
    );
    if (condition) filters.push(condition);
  }

  const where = filters.length ? and(...filters) : undefined;
  const direction = query.sortOrder === 'asc' ? asc : desc;

  const sortColumn =
    query.sortBy === 'totalSpent'
      ? customers.totalSpent
      : query.sortBy === 'visitCount'
        ? customers.visitCount
        : query.sortBy === 'name'
          ? customers.name
          : customers.lastVisitAt;

  const offset = (query.page - 1) * query.limit;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(where)
      .orderBy(direction(sortColumn))
      .limit(query.limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(customers).where(where),
  ]);

  sendSuccess(
    res,
    rows.map(toCustomerDto),
    'Customers loaded',
    200,
    buildPaginationMeta(query.page, query.limit, total),
  );
});

/** Quick lookup by phone — how the floor recognises a returning guest. */
export const findCustomerByPhone = asyncHandler(async (req: Request, res: Response) => {
  const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
  if (phone.length < 4) throw ApiError.badRequest('Enter at least 4 digits');

  const [row] = await db
    .select()
    .from(customers)
    .where(ilike(customers.phone, `%${phone}%`))
    .limit(1);

  sendSuccess(res, row ? toCustomerDto(row) : null, row ? 'Customer found' : 'No match');
});

/**
 * Customer Memory — everything the floor should know before greeting a guest:
 * their usual dishes, spend, cadence of visits and recent feedback.
 */
export const getCustomerMemory = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const [customer] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!customer) throw ApiError.notFound('Customer');

  const [favourites, recentOrders, feedbackRows, [visitPattern]] = await Promise.all([
    db
      .select({
        name: orderItems.nameSnapshot,
        menuItemId: orderItems.menuItemId,
        timesOrdered: sql<number>`sum(${orderItems.quantity})::int`,
        lastOrderedAt: sql<Date>`max(${orders.placedAt})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(and(eq(orders.customerId, id), sql`${orders.status} <> 'cancelled'`))
      .groupBy(orderItems.nameSnapshot, orderItems.menuItemId)
      .orderBy(desc(sql`sum(${orderItems.quantity})`))
      .limit(5),

    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        total: orders.total,
        status: orders.status,
        type: orders.type,
        placedAt: orders.placedAt,
      })
      .from(orders)
      .where(eq(orders.customerId, id))
      .orderBy(desc(orders.placedAt))
      .limit(10),

    db
      .select({
        id: feedback.id,
        rating: feedback.rating,
        comment: feedback.comment,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .where(eq(feedback.customerId, id))
      .orderBy(desc(feedback.createdAt))
      .limit(5),

    db
      .select({
        averageDaysBetweenVisits: sql<number>`
          coalesce(
            round(
              extract(epoch from (max(${orders.placedAt}) - min(${orders.placedAt})))
              / nullif(greatest(count(*) - 1, 1), 0) / 86400
            ), 0)::int`,
        favouriteHour: sql<number>`coalesce(mode() within group (order by extract(hour from ${orders.placedAt})), 0)::int`,
      })
      .from(orders)
      .where(and(eq(orders.customerId, id), eq(orders.status, 'completed'))),
  ]);

  const daysSinceLastVisit = customer.lastVisitAt
    ? Math.floor((Date.now() - customer.lastVisitAt.getTime()) / 86_400_000)
    : null;

  // Birthday within the next 30 days is worth flagging to the host.
  let daysUntilBirthday: number | null = null;
  if (customer.birthday) {
    const birthday = new Date(customer.birthday);
    const now = new Date();
    const next = new Date(now.getFullYear(), birthday.getMonth(), birthday.getDate());
    if (next.getTime() < now.setHours(0, 0, 0, 0)) next.setFullYear(next.getFullYear() + 1);
    daysUntilBirthday = Math.round((next.getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  }

  const averageRating =
    feedbackRows.length > 0
      ? Math.round(
          (feedbackRows.reduce((sum, row) => sum + row.rating, 0) / feedbackRows.length) * 10,
        ) / 10
      : null;

  sendSuccess(
    res,
    {
      customer: toCustomerDto(customer),
      isReturning: customer.visitCount > 1,
      tier:
        customer.visitCount >= 20
          ? 'regular'
          : customer.visitCount >= 8
            ? 'frequent'
            : customer.visitCount >= 2
              ? 'returning'
              : 'new',
      daysSinceLastVisit,
      daysUntilBirthday,
      averageRating,
      favouriteDishes: favourites.map((row) => ({
        menuItemId: row.menuItemId,
        name: row.name,
        timesOrdered: row.timesOrdered,
        lastOrderedAt: row.lastOrderedAt ? new Date(row.lastOrderedAt).toISOString() : null,
      })),
      recentOrders: recentOrders.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        total: toNumber(row.total),
        status: row.status,
        type: row.type,
        placedAt: row.placedAt.toISOString(),
      })),
      recentFeedback: feedbackRows.map((row) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        createdAt: row.createdAt.toISOString(),
      })),
      visitPattern: {
        averageDaysBetweenVisits: visitPattern?.averageDaysBetweenVisits ?? 0,
        favouriteHour: visitPattern?.favouriteHour ?? 0,
      },
    },
    'Customer memory loaded',
  );
});

/** Guests with a birthday in the next N days, for the dashboard prompt. */
export const getUpcomingBirthdays = asyncHandler(async (req: Request, res: Response) => {
  const withinDays = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);

  const rows = await db
    .select()
    .from(customers)
    .where(
      sql`${customers.birthday} is not null and (
        (date_part('doy', ${customers.birthday}) - date_part('doy', current_date) + 365)::int % 365
      ) <= ${withinDays}`,
    )
    .orderBy(
      sql`((date_part('doy', ${customers.birthday}) - date_part('doy', current_date) + 365)::int % 365)`,
    )
    .limit(50);

  sendSuccess(res, rows.map(toCustomerDto), 'Upcoming birthdays loaded');
});

export const getCustomer = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const [row] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!row) throw ApiError.notFound('Customer');
  sendSuccess(res, toCustomerDto(row), 'Customer loaded');
});

export const createCustomer = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = createCustomerSchema.parse(req.body);

  const [created] = await db
    .insert(customers)
    .values({
      name: input.name,
      phone: input.phone,
      email: input.email || null,
      birthday: input.birthday ? input.birthday.toISOString().slice(0, 10) : null,
      notes: input.notes || null,
      firstVisitAt: new Date(),
    })
    .returning();

  if (!created) throw ApiError.internal('Could not create the customer');

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'customer.created',
    entityType: 'customer',
    entityId: created.id,
    description: `${user.name} added customer ${created.name}`,
  });

  sendCreated(res, toCustomerDto(created), 'Customer added');
});

export const updateCustomer = asyncHandler(async (req: Request, res: Response) => {
  const input = updateCustomerSchema.parse(req.body);
  const id = req.params.id as string;

  const [updated] = await db
    .update(customers)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.birthday !== undefined
        ? { birthday: input.birthday ? input.birthday.toISOString().slice(0, 10) : null }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(customers.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Customer');
  sendSuccess(res, toCustomerDto(updated), 'Customer updated');
});

export const adjustLoyaltyPoints = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = adjustLoyaltySchema.parse(req.body);
  const id = req.params.id as string;

  const [updated] = await db
    .update(customers)
    .set({
      loyaltyPoints: sql`greatest(0, ${customers.loyaltyPoints} + ${input.points})`,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Customer');

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'customer.loyalty_adjusted',
    entityType: 'customer',
    entityId: id,
    description: `${user.name} ${input.points >= 0 ? 'added' : 'deducted'} ${Math.abs(
      input.points,
    )} loyalty points for ${updated.name}`,
    metadata: { points: input.points, reason: input.reason },
  });

  sendSuccess(res, toCustomerDto(updated), 'Loyalty points updated');
});

export const deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.customerId, id));

  if (count > 0) {
    throw ApiError.conflict(
      `This customer has ${count} order${count === 1 ? '' : 's'} on record and cannot be deleted.`,
    );
  }

  const [deleted] = await db.delete(customers).where(eq(customers.id, id)).returning();
  if (!deleted) throw ApiError.notFound('Customer');

  sendSuccess(res, null, 'Customer deleted');
});

/* ── Feedback ───────────────────────────────────────────────────────────── */

export const listFeedback = asyncHandler(async (req: Request, res: Response) => {
  const query = listQuerySchema.parse(req.query);
  const offset = (query.page - 1) * query.limit;

  const where = query.from ? gte(feedback.createdAt, query.from) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: feedback.id,
        rating: feedback.rating,
        foodRating: feedback.foodRating,
        serviceRating: feedback.serviceRating,
        ambienceRating: feedback.ambienceRating,
        comment: feedback.comment,
        createdAt: feedback.createdAt,
        customerName: customers.name,
        orderNumber: orders.orderNumber,
      })
      .from(feedback)
      .leftJoin(customers, eq(feedback.customerId, customers.id))
      .leftJoin(orders, eq(feedback.orderId, orders.id))
      .where(where)
      .orderBy(desc(feedback.createdAt))
      .limit(query.limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(feedback).where(where),
  ]);

  sendSuccess(
    res,
    rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    'Feedback loaded',
    200,
    buildPaginationMeta(query.page, query.limit, total),
  );
});
