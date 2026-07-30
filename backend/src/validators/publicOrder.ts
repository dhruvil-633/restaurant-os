import { z } from 'zod';
import { phoneSchema } from './common';

/**
 * Guests ordering from the public page are untrusted, so this schema is
 * deliberately tighter than the staff-facing one: no table assignment, no
 * discounts, no waiter selection, and smaller ceilings on quantity.
 */
export const publicOrderSchema = z
  .object({
    type: z.enum(['takeaway', 'delivery']),
    customerName: z.string().trim().min(2, 'Enter your name').max(120),
    customerPhone: phoneSchema,
    customerEmail: z.string().trim().email('Enter a valid email').max(160).optional().or(z.literal('')),
    deliveryAddress: z.string().trim().max(500).optional().or(z.literal('')),
    notes: z.string().trim().max(300).optional().or(z.literal('')),
    items: z
      .array(
        z.object({
          menuItemId: z.string().uuid(),
          quantity: z.coerce.number().int().min(1).max(20),
          notes: z.string().trim().max(200).optional().or(z.literal('')),
        }),
      )
      .min(1, 'Add at least one dish')
      .max(30, 'That is too many line items for one order'),
  })
  .refine((data) => data.type !== 'delivery' || (data.deliveryAddress ?? '').trim().length >= 10, {
    message: 'Delivery orders need a full address',
    path: ['deliveryAddress'],
  });

export const trackOrderSchema = z.object({
  orderNumber: z.string().trim().min(4).max(32),
  phone: z.string().trim().min(4).max(32),
});

export type PublicOrderInput = z.infer<typeof publicOrderSchema>;
