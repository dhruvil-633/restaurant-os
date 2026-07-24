import { z } from 'zod';
import { emailSchema, listQuerySchema, moneySchema, phoneSchema } from './common';

/* ── Customers ──────────────────────────────────────────────────────────── */

export const createCustomerSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name').max(120),
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal('')),
  birthday: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const adjustLoyaltySchema = z.object({
  points: z.coerce.number().int().min(-100_000).max(100_000),
  reason: z.string().trim().max(200).optional(),
});

/* ── Reservations ───────────────────────────────────────────────────────── */

export const createReservationSchema = z.object({
  customerName: z.string().trim().min(2, 'Enter the guest name').max(120),
  customerPhone: phoneSchema,
  customerEmail: emailSchema.optional().or(z.literal('')),
  tableId: z.string().uuid().optional().nullable(),
  partySize: z.coerce.number().int().min(1, 'At least one guest').max(50),
  reservedFor: z.coerce.date().refine((date) => date.getTime() > Date.now() - 60 * 60 * 1000, {
    message: 'Choose a time in the future',
  }),
  durationMinutes: z.coerce.number().int().min(15).max(480).default(90),
  specialRequest: z.string().trim().max(500).optional().or(z.literal('')),
});

export const updateReservationSchema = createReservationSchema.partial().extend({
  status: z
    .enum(['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'])
    .optional(),
});

export const reservationQuerySchema = listQuerySchema.extend({
  status: z.enum(['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show']).optional(),
  tableId: z.string().uuid().optional(),
});

/* ── Employees ──────────────────────────────────────────────────────────── */

export const createEmployeeSchema = z.object({
  userId: z.string().uuid().optional().nullable(),
  employeeCode: z.string().trim().min(2).max(24),
  name: z.string().trim().min(2, 'Enter a name').max(120),
  position: z.string().trim().min(2, 'Enter a position').max(80),
  department: z.string().trim().min(2).max(80).default('Service'),
  phone: phoneSchema.optional().or(z.literal('')),
  email: emailSchema.optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  emergencyContact: z.string().trim().max(120).optional().or(z.literal('')),
  avatarUrl: z.string().url().max(500).optional().or(z.literal('')),
  monthlySalary: moneySchema.default(0),
  hiredAt: z.coerce.date(),
  isActive: z.boolean().default(true),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const attendanceSchema = z.object({
  employeeId: z.string().uuid(),
  workDate: z.coerce.date(),
  status: z.enum(['present', 'absent', 'late', 'half_day', 'leave']).default('present'),
  checkInAt: z.coerce.date().optional().nullable(),
  checkOutAt: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
});

export const shiftSchema = z
  .object({
    employeeId: z.string().uuid(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    label: z.string().trim().min(1).max(60).default('Shift'),
    notes: z.string().trim().max(300).optional().or(z.literal('')),
  })
  .refine((data) => data.endsAt.getTime() > data.startsAt.getTime(), {
    message: 'The shift must end after it starts',
    path: ['endsAt'],
  });

/* ── Feedback ───────────────────────────────────────────────────────────── */

const ratingSchema = z.coerce.number().int().min(1, 'Rate at least 1').max(5);

export const createFeedbackSchema = z.object({
  orderId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  rating: ratingSchema,
  foodRating: ratingSchema.optional(),
  serviceRating: ratingSchema.optional(),
  ambienceRating: ratingSchema.optional(),
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
});
