import { z } from 'zod';

export const uuidParamSchema = z.object({
  id: z.string().uuid('That identifier is not valid'),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const searchSchema = z.object({
  search: z.string().trim().max(120).optional(),
});

export const sortSchema = z.object({
  sortBy: z.string().trim().max(40).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const dateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/** `?period=week` style presets used across dashboard and report endpoints. */
export const periodSchema = z.object({
  period: z.enum(['today', 'week', 'month', 'quarter', 'year', 'custom']).default('week'),
});

export const listQuerySchema = paginationSchema
  .merge(searchSchema)
  .merge(sortSchema)
  .merge(dateRangeSchema);

export type ListQuery = z.infer<typeof listQuerySchema>;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(160);

export const phoneSchema = z
  .string()
  .trim()
  .min(7, 'Enter a valid phone number')
  .max(32, 'That phone number is too long')
  .regex(/^[+\d][\d\s()-]{5,}$/, 'Enter a valid phone number');

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(72, 'Passwords cannot exceed 72 characters')
  .regex(/[a-z]/, 'Include at least one lowercase letter')
  .regex(/[A-Z]/, 'Include at least one uppercase letter')
  .regex(/\d/, 'Include at least one number');

export const moneySchema = z.coerce
  .number()
  .min(0, 'Cannot be negative')
  .max(9_999_999, 'That value is too large');

export const quantitySchema = z.coerce
  .number()
  .min(0, 'Cannot be negative')
  .max(9_999_999, 'That value is too large');
