import { z } from 'zod';
import { USER_ROLES } from '../types/roles';
import { emailSchema, passwordSchema, phoneSchema } from './common';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(120),
  email: emailSchema,
  password: passwordSchema,
  restaurantName: z.string().trim().min(2).max(140).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(72),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'The reset link is incomplete'),
  password: passwordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(72),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'Your new password must be different from the current one',
    path: ['newPassword'],
  });

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name').max(120).optional(),
  phone: phoneSchema.optional().or(z.literal('')),
  avatarUrl: z.string().url().max(500).optional().or(z.literal('')),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Enter a full name').max(120),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(USER_ROLES),
  phone: phoneSchema.optional().or(z.literal('')),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: emailSchema.optional(),
  role: z.enum(USER_ROLES).optional(),
  phone: phoneSchema.optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
