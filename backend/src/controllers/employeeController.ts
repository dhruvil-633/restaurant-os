import { and, asc, avg, count, desc, eq, gte, ilike, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { db } from '../db';
import {
  attendance,
  employees,
  feedback,
  orders,
  shifts,
  users,
  type AttendanceRow,
  type EmployeeRow,
  type ShiftRow,
} from '../db/schema';
import { requireUser } from '../middlewares/auth';
import { recordActivity } from '../services/activityLog';
import { ApiError } from '../utils/apiError';
import { asyncHandler } from '../utils/asyncHandler';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse';
import { toNumber } from '../utils/serialize';
import { listQuerySchema } from '../validators/common';
import {
  attendanceSchema,
  createEmployeeSchema,
  shiftSchema,
  updateEmployeeSchema,
} from '../validators/people';

function toEmployeeDto(row: EmployeeRow, linkedRole: string | null = null) {
  return {
    id: row.id,
    userId: row.userId,
    linkedRole,
    employeeCode: row.employeeCode,
    name: row.name,
    position: row.position,
    department: row.department,
    phone: row.phone,
    email: row.email,
    address: row.address,
    emergencyContact: row.emergencyContact,
    avatarUrl: row.avatarUrl,
    monthlySalary: toNumber(row.monthlySalary),
    hiredAt: row.hiredAt,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAttendanceDto(row: AttendanceRow) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    workDate: row.workDate,
    status: row.status,
    checkInAt: row.checkInAt?.toISOString() ?? null,
    checkOutAt: row.checkOutAt?.toISOString() ?? null,
    hoursWorked: toNumber(row.hoursWorked),
    notes: row.notes,
  };
}

function toShiftDto(row: ShiftRow) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    label: row.label,
    notes: row.notes,
  };
}

export const listEmployees = asyncHandler(async (req: Request, res: Response) => {
  const query = listQuerySchema.parse(req.query);
  const department = typeof req.query.department === 'string' ? req.query.department : undefined;

  const filters: SQL[] = [];
  if (department) filters.push(eq(employees.department, department));
  if (query.search) {
    const term = `%${query.search}%`;
    const condition = or(
      ilike(employees.name, term),
      ilike(employees.employeeCode, term),
      ilike(employees.position, term),
    );
    if (condition) filters.push(condition);
  }

  const where = filters.length ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.limit;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ employee: employees, linkedRole: users.role })
      .from(employees)
      .leftJoin(users, eq(employees.userId, users.id))
      .where(where)
      .orderBy(desc(employees.isActive), asc(employees.name))
      .limit(query.limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(employees).where(where),
  ]);

  sendSuccess(
    res,
    rows.map((row) => toEmployeeDto(row.employee, row.linkedRole)),
    'Employees loaded',
    200,
    buildPaginationMeta(query.page, query.limit, total),
  );
});

export const getEmployee = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;

  const [row] = await db
    .select({ employee: employees, linkedRole: users.role })
    .from(employees)
    .leftJoin(users, eq(employees.userId, users.id))
    .where(eq(employees.id, id))
    .limit(1);

  if (!row) throw ApiError.notFound('Employee');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [attendanceRows, shiftRows] = await Promise.all([
    db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, id),
          gte(attendance.workDate, thirtyDaysAgo.toISOString().slice(0, 10)),
        ),
      )
      .orderBy(desc(attendance.workDate)),
    db
      .select()
      .from(shifts)
      .where(and(eq(shifts.employeeId, id), gte(shifts.startsAt, thirtyDaysAgo)))
      .orderBy(asc(shifts.startsAt)),
  ]);

  const present = attendanceRows.filter((entry) => entry.status === 'present').length;
  const attendanceRate =
    attendanceRows.length > 0 ? Math.round((present / attendanceRows.length) * 100) : 0;

  sendSuccess(
    res,
    {
      ...toEmployeeDto(row.employee, row.linkedRole),
      attendance: attendanceRows.map(toAttendanceDto),
      shifts: shiftRows.map(toShiftDto),
      attendanceRate,
      totalHoursLast30Days:
        Math.round(attendanceRows.reduce((sum, entry) => sum + toNumber(entry.hoursWorked), 0) * 10) /
        10,
    },
    'Employee loaded',
  );
});

export const createEmployee = asyncHandler(async (req: Request, res: Response) => {
  const actor = requireUser(req);
  const input = createEmployeeSchema.parse(req.body);

  const [created] = await db
    .insert(employees)
    .values({
      userId: input.userId ?? null,
      employeeCode: input.employeeCode,
      name: input.name,
      position: input.position,
      department: input.department,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      emergencyContact: input.emergencyContact || null,
      avatarUrl: input.avatarUrl || null,
      monthlySalary: String(input.monthlySalary),
      hiredAt: input.hiredAt.toISOString().slice(0, 10),
      isActive: input.isActive,
    })
    .returning();

  if (!created) throw ApiError.internal('Could not create the employee record');

  await recordActivity({
    userId: actor.id,
    actorName: actor.name,
    action: 'employee.created',
    entityType: 'employee',
    entityId: created.id,
    description: `${actor.name} added ${created.name} as ${created.position}`,
  });

  sendCreated(res, toEmployeeDto(created), 'Employee added');
});

export const updateEmployee = asyncHandler(async (req: Request, res: Response) => {
  const input = updateEmployeeSchema.parse(req.body);
  const id = req.params.id as string;

  const [updated] = await db
    .update(employees)
    .set({
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.employeeCode !== undefined ? { employeeCode: input.employeeCode } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.department !== undefined ? { department: input.department } : {}),
      ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
      ...(input.email !== undefined ? { email: input.email || null } : {}),
      ...(input.address !== undefined ? { address: input.address || null } : {}),
      ...(input.emergencyContact !== undefined
        ? { emergencyContact: input.emergencyContact || null }
        : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl || null } : {}),
      ...(input.monthlySalary !== undefined ? { monthlySalary: String(input.monthlySalary) } : {}),
      ...(input.hiredAt !== undefined ? { hiredAt: input.hiredAt.toISOString().slice(0, 10) } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(employees.id, id))
    .returning();

  if (!updated) throw ApiError.notFound('Employee');
  sendSuccess(res, toEmployeeDto(updated), 'Employee updated');
});

export const deleteEmployee = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const [deleted] = await db.delete(employees).where(eq(employees.id, id)).returning();
  if (!deleted) throw ApiError.notFound('Employee');
  sendSuccess(res, null, 'Employee removed');
});

/* ── Attendance ─────────────────────────────────────────────────────────── */

export const listAttendance = asyncHandler(async (req: Request, res: Response) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date();
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  if (!req.query.from) from.setDate(from.getDate() - 30);

  const rows = await db
    .select({ attendance, employeeName: employees.name, employeeCode: employees.employeeCode })
    .from(attendance)
    .innerJoin(employees, eq(attendance.employeeId, employees.id))
    .where(
      and(
        gte(attendance.workDate, from.toISOString().slice(0, 10)),
        lte(attendance.workDate, to.toISOString().slice(0, 10)),
      ),
    )
    .orderBy(desc(attendance.workDate), asc(employees.name));

  sendSuccess(
    res,
    rows.map((row) => ({
      ...toAttendanceDto(row.attendance),
      employeeName: row.employeeName,
      employeeCode: row.employeeCode,
    })),
    'Attendance loaded',
  );
});

/** Upserts one attendance record per employee per day. */
export const markAttendance = asyncHandler(async (req: Request, res: Response) => {
  const input = attendanceSchema.parse(req.body);
  const workDate = input.workDate.toISOString().slice(0, 10);

  const hoursWorked =
    input.checkInAt && input.checkOutAt
      ? Math.max(
          0,
          Math.round(
            ((input.checkOutAt.getTime() - input.checkInAt.getTime()) / 3_600_000) * 100,
          ) / 100,
        )
      : 0;

  const [record] = await db
    .insert(attendance)
    .values({
      employeeId: input.employeeId,
      workDate,
      status: input.status,
      checkInAt: input.checkInAt ?? null,
      checkOutAt: input.checkOutAt ?? null,
      hoursWorked: String(hoursWorked),
      notes: input.notes || null,
    })
    .onConflictDoUpdate({
      target: [attendance.employeeId, attendance.workDate],
      set: {
        status: input.status,
        checkInAt: input.checkInAt ?? null,
        checkOutAt: input.checkOutAt ?? null,
        hoursWorked: String(hoursWorked),
        notes: input.notes || null,
      },
    })
    .returning();

  if (!record) throw ApiError.internal('Could not save attendance');
  sendSuccess(res, toAttendanceDto(record), 'Attendance saved');
});

/* ── Shifts ─────────────────────────────────────────────────────────────── */

export const listShifts = asyncHandler(async (req: Request, res: Response) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date();
  const to = req.query.to ? new Date(String(req.query.to)) : new Date(from);
  if (!req.query.to) to.setDate(to.getDate() + 7);

  const rows = await db
    .select({ shift: shifts, employeeName: employees.name, position: employees.position })
    .from(shifts)
    .innerJoin(employees, eq(shifts.employeeId, employees.id))
    .where(and(gte(shifts.startsAt, from), lte(shifts.startsAt, to)))
    .orderBy(asc(shifts.startsAt));

  sendSuccess(
    res,
    rows.map((row) => ({
      ...toShiftDto(row.shift),
      employeeName: row.employeeName,
      position: row.position,
    })),
    'Shifts loaded',
  );
});

export const createShift = asyncHandler(async (req: Request, res: Response) => {
  const input = shiftSchema.parse(req.body);

  const [created] = await db
    .insert(shifts)
    .values({
      employeeId: input.employeeId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      label: input.label,
      notes: input.notes || null,
    })
    .returning();

  if (!created) throw ApiError.internal('Could not create the shift');
  sendCreated(res, toShiftDto(created), 'Shift scheduled');
});

export const deleteShift = asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const [deleted] = await db.delete(shifts).where(eq(shifts.id, id)).returning();
  if (!deleted) throw ApiError.notFound('Shift');
  sendSuccess(res, null, 'Shift removed');
});

/**
 * Employee Performance — service speed, volume, revenue, guest ratings and
 * attendance, combined into one comparable score per staff member.
 */
export const getPerformance = asyncHandler(async (req: Request, res: Response) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date();
  if (!req.query.from) from.setDate(from.getDate() - 30);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();

  const serviceStats = await db
    .select({
      waiterId: orders.waiterId,
      waiterName: users.name,
      role: users.role,
      avatarUrl: users.avatarUrl,
      ordersServed: count(orders.id),
      revenue: sql<number>`coalesce(sum(${orders.total}), 0)::float`,
      averageServiceMinutes: sql<number>`
        coalesce(round(avg(
          extract(epoch from (${orders.completedAt} - ${orders.placedAt})) / 60
        ))::int, 0)`,
      averageGuests: sql<number>`coalesce(round(avg(${orders.guestCount}), 1), 0)::float`,
    })
    .from(orders)
    .innerJoin(users, eq(orders.waiterId, users.id))
    .where(
      and(eq(orders.status, 'completed'), gte(orders.placedAt, from), lte(orders.placedAt, to)),
    )
    .groupBy(orders.waiterId, users.name, users.role, users.avatarUrl)
    .orderBy(desc(count(orders.id)));

  // Ratings and attendance are joined per staff member where a record exists.
  const [ratingRows, attendanceRows] = await Promise.all([
    db
      .select({
        waiterId: orders.waiterId,
        averageRating: avg(feedback.rating),
        reviewCount: count(feedback.id),
      })
      .from(feedback)
      .innerJoin(orders, eq(feedback.orderId, orders.id))
      .where(and(gte(orders.placedAt, from), lte(orders.placedAt, to)))
      .groupBy(orders.waiterId),

    db
      .select({
        userId: employees.userId,
        presentDays: sql<number>`count(*) filter (where ${attendance.status} = 'present')::int`,
        totalDays: sql<number>`count(*)::int`,
        hoursWorked: sql<number>`coalesce(sum(${attendance.hoursWorked}), 0)::float`,
      })
      .from(attendance)
      .innerJoin(employees, eq(attendance.employeeId, employees.id))
      .where(
        and(
          gte(attendance.workDate, from.toISOString().slice(0, 10)),
          lte(attendance.workDate, to.toISOString().slice(0, 10)),
        ),
      )
      .groupBy(employees.userId),
  ]);

  const ratingByWaiter = new Map(ratingRows.map((row) => [row.waiterId, row]));
  const attendanceByUser = new Map(attendanceRows.map((row) => [row.userId, row]));

  const maxOrders = Math.max(...serviceStats.map((row) => row.ordersServed), 1);

  const staff = serviceStats.map((row) => {
    const rating = ratingByWaiter.get(row.waiterId);
    const attendanceEntry = attendanceByUser.get(row.waiterId);

    const averageRating = rating?.averageRating ? Number(rating.averageRating) : null;
    const attendanceRate =
      attendanceEntry && attendanceEntry.totalDays > 0
        ? Math.round((attendanceEntry.presentDays / attendanceEntry.totalDays) * 100)
        : null;

    // Score blends volume, speed, guest rating and reliability out of 100.
    const volumeScore = (row.ordersServed / maxOrders) * 30;
    const speedScore =
      row.averageServiceMinutes > 0 ? Math.max(0, 30 - (row.averageServiceMinutes - 25)) : 15;
    const ratingScore = averageRating !== null ? (averageRating / 5) * 25 : 15;
    const attendanceScore = attendanceRate !== null ? (attendanceRate / 100) * 15 : 10;

    return {
      userId: row.waiterId,
      name: row.waiterName,
      role: row.role,
      avatarUrl: row.avatarUrl,
      ordersServed: row.ordersServed,
      revenue: Math.round(row.revenue * 100) / 100,
      averageServiceMinutes: row.averageServiceMinutes,
      averageGuests: row.averageGuests,
      averageRating,
      reviewCount: rating?.reviewCount ?? 0,
      attendanceRate,
      hoursWorked: attendanceEntry?.hoursWorked ?? 0,
      performanceScore: Math.min(
        100,
        Math.round(volumeScore + Math.min(speedScore, 30) + ratingScore + attendanceScore),
      ),
    };
  });

  staff.sort((a, b) => b.performanceScore - a.performanceScore);

  sendSuccess(
    res,
    {
      from: from.toISOString(),
      to: to.toISOString(),
      staff,
      topPerformer: staff[0] ?? null,
    },
    'Performance loaded',
  );
});
