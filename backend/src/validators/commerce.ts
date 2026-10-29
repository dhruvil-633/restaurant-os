import { z } from 'zod';
import { moneySchema } from './common';

export const addPaymentSchema = z.object({
  amount: moneySchema.refine((value) => value > 0, 'Enter an amount greater than zero'),
  method: z.enum(['cash', 'card', 'upi', 'wallet']),
  /** Free text so staff can write whatever the table calls itself. */
  payerLabel: z.string().trim().max(60).optional().or(z.literal('')),
  reference: z.string().trim().max(80).optional().or(z.literal('')),
});

export const rewardSchema = z.object({
  name: z.string().trim().min(2, 'Name the reward').max(120),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  pointsCost: z.coerce.number().int().min(1, 'Must cost at least one point').max(1000000),
  type: z.enum(['discount_amount', 'discount_percent', 'free_item']),
  value: moneySchema.default(0),
  menuItemId: z.string().uuid().nullable().optional(),
  maxDiscount: moneySchema.nullable().optional(),
  isActive: z.boolean().default(true),
});

export const redeemRewardSchema = z.object({
  rewardId: z.string().uuid(),
  orderId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
});

export const reorderQuerySchema = z.object({
  /** How far back to measure the burn rate. */
  lookbackDays: z.coerce.number().int().min(1).max(180).default(30),
  /** Flag anything that will not survive this many more days. */
  coverDays: z.coerce.number().int().min(1).max(90).default(7),
});
