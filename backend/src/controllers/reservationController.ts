import { and, asc, desc, eq, gte, ilike, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import {
  customers,
  feedback,
  orders,
  reservations,
  restaurantTables,
  type ReservationRow,
} from '../db/schema';
import { requireUser } from '../middlewares/auth';
import { recordActivity } from '../services/activityLog';
import { notifyRoles } from '../services/notification';
import { generateReservationCode } from '../services/orderService';
import { realtime } from '../socket';
import { SOCKET_EVENTS } from '../socket/events';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse';
import {
  createFeedbackSchema,
  createReservationSchema,
  reservationQuerySchema,
  updateReservationSchema,
} from '../validators/people';

function toReservationDto(row: ReservationRow, tableLabel: string | null = null) {
  const reservedFor = row.reservedFor;
  return {
    id: row.id,
    reservationCode: row.reservationCode,
    customerId: row.customerId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail,
    tableId: row.tableId,
    tableLabel,
    partySize: row.partySize,
    reservedFor: reservedFor.toISOString(),
    durationMinutes: row.durationMinutes,
    status: row.status,
    specialRequest: row.specialRequest,
    seatedAt: row.seatedAt?.toISOString() ?? null,
    minutesUntilArrival: Math.round((reservedFor.getTime() - Date.now()) / 60_000),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Rejects a booking that would double-book a table in the same window. */
async function assertTableIsFree(
  tableId: string,
  reservedFor: Date,
  durationMinutes: number,
  excludeReservationId?: string,
): Promise<void> {
  const endsAt = new Date(reservedFor.getTime() + durationMinutes * 60_000);

  const filters: SQL[] = [
    eq(reservations.tableId, tableId),
    sql`${reservations.status} in ('pending', 'confirmed', 'seated')`,
    // Overlap test: existing start < new end AND existing end > new start.
    lt(reservations.reservedFor, endsAt),
    sql`${reservations.reservedFor} + (${reservations.durationMinutes} * interval '1 minute') > ${reservedFor}`,
  ];

  if (excludeReservationId) filters.push(ne(reservations.id, excludeReservationId));

  const [clash] = await db
    .select({ code: reservations.reservationCode, reservedFor: reservations.reservedFor })
    .from(reservations)
    .where(and(...filters))
    .limit(1);

  if (clash) {
    throw ApiError.conflict(
      `That table is already booked at ${clash.reservedFor.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })} (${clash.code}).`,
    );
  }
}

export const listReservations = asyncHandler(async (req: Request, res: Response) => {
  const query = reservationQuerySchema.parse(req.query);

  const filters: SQL[] = [];
  if (query.status) filters.push(eq(reservations.status, query.status));
  if (query.tableId) filters.push(eq(reservations.tableId, query.tableId));
  if (query.from) filters.push(gte(reservations.reservedFor, query.from));
  if (query.to) filters.push(lte(reservations.reservedFor, query.to));
  if (query.search) {
    const term = `%${query.search}%`;
    const condition = or(
      ilike(reservations.customerName, term),
      ilike(reservations.customerPhone, term),
      ilike(reservations.reservationCode, term),
    );
    if (condition) filters.push(condition);
  }

  const where = filters.length ? and(...filters) : undefined;
  const direction = query.sortOrder === 'asc' ? asc : desc;
  const offset = (query.page - 1) * query.limit;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ reservation: reservations, tableLabel: restaurantTables.label })
      .from(reservations)
      .leftJoin(restaurantTables, eq(reservations.tableId, restaurantTables.id))
      .where(where)
      .orderBy(direction(reservations.reservedFor))
      .limit(query.limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(reservations).where(where),
  ]);

  sendSuccess(
    res,
    rows.map((row) => toReservationDto(row.reservation, row.tableLabel)),
    'Reservations loaded',
    200,
    buildPaginationMeta(query.page, query.limit, total),
  );
});

/** Today's bookings, split into what's ahead and what's already seated. */
export const getTodayReservations = asyncHandler(async (_req: Request, res: Response) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const rows = await db
    .select({ reservation: reservations, tableLabel: restaurantTables.label })
    .from(reservations)
    .leftJoin(restaurantTables, eq(reservations.tableId, restaurantTables.id))
    .where(
      and(gte(reservations.reservedFor, startOfDay), lte(reservations.reservedFor, endOfDay)),
    )
    .orderBy(asc(reservations.reservedFor));

  const all = rows.map((row) => toReservationDto(row.reservation, row.tableLabel));

  sendSuccess(
    res,
    {
      reservations: all,
      summary: {
        total: all.length,
        upcoming: all.filter((entry) => ['pending', 'confirmed'].includes(entry.status)).length,
        seated: all.filter((entry) => entry.status === 'seated').length,
        completed: all.filter((entry) => entry.status === 'completed').length,
        noShow: all.filter((entry) => entry.status === 'no_show').length,
        expectedGuests: all
          .filter((entry) => !['cancelled', 'no_show'].includes(entry.status))
          .reduce((sum, entry) => sum + entry.partySize, 0),
      },
    },
    "Today's reservations loaded",
  );
});

export const getReservation = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const [row] = await db
    .select({ reservation: reservations, tableLabel: restaurantTables.label })
    .from(reservations)
    .leftJoin(restaurantTables, eq(reservations.tableId, restaurantTables.id))
    .where(eq(reservations.id, id))
    .limit(1);

  if (!row) throw ApiError.notFound('Reservation');
  sendSuccess(res, toReservationDto(row.reservation, row.tableLabel), 'Reservation loaded');
});

export const createReservation = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = createReservationSchema.parse(req.body);

  let tableLabel: string | null = null;
  if (input.tableId) {
    const [table] = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.id, input.tableId))
      .limit(1);

    if (!table) throw ApiError.badRequest('That table does not exist');
    if (table.capacity < input.partySize) {
      throw ApiError.badRequest(
        `Table ${table.label} seats ${table.capacity}, but the party is ${input.partySize}.`,
      );
    }

    await assertTableIsFree(input.tableId, input.reservedFor, input.durationMinutes);
    tableLabel = table.label;
  }

  // Link to an existing guest record when the phone number is already known.
  const [existingCustomer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.phone, input.customerPhone))
    .limit(1);

  const [created] = await db
    .insert(reservations)
    .values({
      reservationCode: await generateReservationCode(),
      customerId: existingCustomer?.id ?? null,
      tableId: input.tableId ?? null,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail || null,
      partySize: input.partySize,
      reservedFor: input.reservedFor,
      durationMinutes: input.durationMinutes,
      status: 'confirmed',
      specialRequest: input.specialRequest || null,
      createdById: user.id,
    })
    .returning();

  if (!created) throw ApiError.internal('Could not create the reservation');

  if (input.tableId) {
    await db
      .update(restaurantTables)
      .set({ status: 'reserved', updatedAt: new Date() })
      .where(and(eq(restaurantTables.id, input.tableId), eq(restaurantTables.status, 'available')));
  }

  const dto = toReservationDto(created, tableLabel);
  realtime.toFloor(SOCKET_EVENTS.RESERVATION_CREATED, dto);

  await notifyRoles(['manager', 'waiter'], {
    type: 'reservation_created',
    title: `Reservation ${created.reservationCode}`,
    message: `${created.customerName}, party of ${created.partySize}${
      tableLabel ? ` at table ${tableLabel}` : ''
    }`,
    link: '/reservations',
    payload: { reservationId: created.id },
  });

  await recordActivity({
    userId: user.id,
    actorName: user.name,
    action: 'reservation.created',
    entityType: 'reservation',
    entityId: created.id,
    description: `${user.name} booked ${created.customerName} for ${created.partySize} guests`,
  });

  sendCreated(res, dto, 'Reservation confirmed');
});

export const updateReservation = asyncHandler(async (req: Request, res: Response) => {
  const user = requireUser(req);
  const input = updateReservationSchema.parse(req.body);
  const id = req.params.id as string;

  const [existing] = await db.select().from(reservations).where(eq(reservations.id, id)).limit(1);
  if (!existing) throw ApiError.notFound('Reservation');

  const nextTableId = input.tableId !== undefined ? input.tableId : existing.tableId;
  const nextReservedFor = input.reservedFor ?? existing.reservedFor;
  const nextDuration = input.durationMinutes ?? existing.durationMinutes;

  if (nextTableId && (input.tableId !== undefined || input.reservedFor || input.durationMinutes)) {
    await assertTableIsFree(nextTableId, nextReservedFor, nextDuration, id);
  }

  const now = new Date();

  const [updated] = await db
    .update(reservations)
    .set({
      ...(input.customerName !== undefined ? { customerName: input.customerName } : {}),
      ...(input.customerPhone !== undefined ? { customerPhone: input.customerPhone } : {}),
      ...(input.customerEmail !== undefined ? { customerEmail: input.customerEmail || null } : {}),
      ...(input.tableId !== undefined ? { tableId: input.tableId } : {}),
      ...(input.partySize !== undefined ? { partySize: input.partySize } : {}),
      ...(input.reservedFor !== undefined ? { reservedFor: input.reservedFor } : {}),
      ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
      ...(input.specialRequest !== undefined
        ? { specialRequest: input.specialRequest || null }
        : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.status === 'seated' ? { seatedAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(reservations.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Reservation');

  // Seating occupies the table; ending the booking frees it again.
  if (updated.tableId) {
    if (input.status === 'seated') {
      await db
        .update(restaurantTables)
        .set({ status: 'occupied', updatedAt: now })
        .where(eq(restaurantTables.id, updated.tableId));
    } else if (
      input.status &&
      ['cancelled', 'no_show', 'completed'].includes(input.status)
    ) {
      await db
        .update(restaurantTables)
        .set({ status: 'available', updatedAt: now })
        .where(
          and(eq(restaurantTables.id, updated.tableId), eq(restaurantTables.status, 'reserved')),
        );
    }
  }

  const dto = toReservationDto(updated);
  realtime.toFloor(SOCKET_EVENTS.RESERVATION_UPDATED, dto);

  if (input.status) {
    await recordActivity({
      userId: user.id,
      actorName: user.name,
      action: `reservation.${input.status}`,
      entityType: 'reservation',
      entityId: id,
      description: `${user.name} marked ${updated.reservationCode} as ${input.status}`,
    });
  }

  sendSuccess(res, dto, 'Reservation updated');
});

export const deleteReservation = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const [deleted] = await db.delete(reservations).where(eq(reservations.id, id)).returning();
  if (!deleted) throw ApiError.notFound('Reservation');

  if (deleted.tableId) {
    await db
      .update(restaurantTables)
      .set({ status: 'available', updatedAt: new Date() })
      .where(and(eq(restaurantTables.id, deleted.tableId), eq(restaurantTables.status, 'reserved')));
  }

  sendSuccess(res, null, 'Reservation deleted');
});

/* ── Feedback capture ───────────────────────────────────────────────────── */

export const createFeedback = asyncHandler(async (req: Request, res: Response) => {
  const input = createFeedbackSchema.parse(req.body);

  let customerId = input.customerId ?? null;

  // Infer the guest from the order when the client did not supply one.
  if (!customerId && input.orderId) {
    const [order] = await db
      .select({ customerId: orders.customerId })
      .from(orders)
      .where(eq(orders.id, input.orderId))
      .limit(1);
    customerId = order?.customerId ?? null;
  }

  const [created] = await db
    .insert(feedback)
    .values({
      orderId: input.orderId ?? null,
      customerId,
      rating: input.rating,
      foodRating: input.foodRating ?? null,
      serviceRating: input.serviceRating ?? null,
      ambienceRating: input.ambienceRating ?? null,
      comment: input.comment || null,
    })
    .returning();

  if (!created) throw ApiError.internal('Could not save the feedback');

  // A poor score should reach a manager immediately, not wait for a report.
  if (created.rating <= 2) {
    await notifyRoles(['owner', 'manager'], {
      type: 'feedback_received',
      title: `${created.rating}-star review received`,
      message: created.comment?.slice(0, 140) ?? 'A guest left a low rating.',
      link: '/customers',
      payload: { feedbackId: created.id },
    });
  }

  sendCreated(
    res,
    { ...created, createdAt: created.createdAt.toISOString() },
    'Thank you for the feedback',
  );
});
