import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { attendanceStatusEnum } from './enums';
import { users } from './auth';

/**
 * Customers exist independently of user accounts — most walk-ins never sign in.
 * Phone is the natural key the floor staff uses to recognise a returning guest.
 */
export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 120 }).notNull(),
    phone: varchar('phone', { length: 32 }).notNull().unique(),
    email: varchar('email', { length: 160 }),
    birthday: date('birthday'),
    notes: text('notes'),
    loyaltyPoints: integer('loyalty_points').notNull().default(0),
    visitCount: integer('visit_count').notNull().default(0),
    totalSpent: numeric('total_spent', { precision: 14, scale: 2 }).notNull().default('0'),
    firstVisitAt: timestamp('first_visit_at', { withTimezone: true }),
    lastVisitAt: timestamp('last_visit_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index('customers_name_idx').on(table.name),
    lastVisitIdx: index('customers_last_visit_idx').on(table.lastVisitAt),
    birthdayIdx: index('customers_birthday_idx').on(table.birthday),
  }),
);

/**
 * An employee record is the HR view of a person; the linked user account is the
 * login. Staff who never sign in (e.g. dishwashers) can exist without a user.
 */
export const employees = pgTable(
  'employees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    employeeCode: varchar('employee_code', { length: 24 }).notNull().unique(),
    name: varchar('name', { length: 120 }).notNull(),
    position: varchar('position', { length: 80 }).notNull(),
    department: varchar('department', { length: 80 }).notNull().default('Service'),
    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 160 }),
    address: text('address'),
    emergencyContact: varchar('emergency_contact', { length: 120 }),
    avatarUrl: text('avatar_url'),
    monthlySalary: numeric('monthly_salary', { precision: 12, scale: 2 }).notNull().default('0'),
    hiredAt: date('hired_at').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('employees_user_idx').on(table.userId),
    activeIdx: index('employees_active_idx').on(table.isActive),
  }),
);

export const attendance = pgTable(
  'attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    workDate: date('work_date').notNull(),
    status: attendanceStatusEnum('status').notNull().default('present'),
    checkInAt: timestamp('check_in_at', { withTimezone: true }),
    checkOutAt: timestamp('check_out_at', { withTimezone: true }),
    hoursWorked: numeric('hours_worked', { precision: 5, scale: 2 }).notNull().default('0'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // One attendance record per employee per day.
    employeeDateIdx: uniqueIndex('attendance_employee_date_idx').on(table.employeeId, table.workDate),
    dateIdx: index('attendance_date_idx').on(table.workDate),
  }),
);

export const shifts = pgTable(
  'shifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    label: varchar('label', { length: 60 }).notNull().default('Shift'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    employeeIdx: index('shifts_employee_idx').on(table.employeeId),
    startsIdx: index('shifts_starts_idx').on(table.startsAt),
  }),
);

export type CustomerRow = typeof customers.$inferSelect;
export type EmployeeRow = typeof employees.$inferSelect;
export type AttendanceRow = typeof attendance.$inferSelect;
export type ShiftRow = typeof shifts.$inferSelect;
