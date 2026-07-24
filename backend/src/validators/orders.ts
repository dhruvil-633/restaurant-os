import { z } from 'zod';
import { listQuerySchema, moneySchema, phoneSchema } from './common';

export const orderItemInputSchema = z.object({
  menuItemId: z.string().uuid('Choose a dish'),
  quantity: z.coerce.number().int().min(1, 'At least one').max(50, 'That is a very large quantity'),
  notes: z.string().trim().max(300).optional().or(z.literal('')),
});

export const createOrderSchema = z
  .object({
    type: z.enum(['dine_in', 'takeaway', 'delivery']).default('dine_in'),
    tableId: z.string().uuid().optional().nullable(),
    customerId: z.string().uuid().optional().nullable(),
    /** Supplied instead of customerId to create/find a guest by phone. */
    customerName: z.string().trim().min(2).max(120).optional(),
    customerPhone: phoneSchema.optional(),
    waiterId: z.string().uuid().optional().nullable(),
    guestCount: z.coerce.number().int().min(1).max(50).default(1),
    priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
    items: z.array(orderItemInputSchema).min(1, 'Add at least one dish to the order').max(60),
    discountAmount: moneySchema.default(0),
    deliveryAddress: z.string().trim().max(500).optional().or(z.literal('')),
    notes: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .refine((data) => data.type !== 'dine_in' || Boolean(data.tableId), {
    message: 'Dine-in orders need a table',
    path: ['tableId'],
  })
  .refine((data) => data.type !== 'delivery' || Boolean(data.deliveryAddress), {
    message: 'Delivery orders need an address',
    path: ['deliveryAddress'],
  });

export const updateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'cooking', 'ready', 'served', 'completed', 'cancelled']),
  cancelReason: z.string().trim().max(300).optional(),
});

export const updateOrderItemStatusSchema = z.object({
  status: z.enum(['queued', 'cooking', 'ready', 'served', 'cancelled']),
});

export const addOrderItemsSchema = z.object({
  items: z.array(orderItemInputSchema).min(1).max(60),
});

export const settleOrderSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'upi', 'wallet']),
  discountAmount: moneySchema.optional(),
});

export const assignChefSchema = z.object({
  chefId: z.string().uuid().nullable(),
});

export const orderQuerySchema = listQuerySchema.extend({
  status: z.enum(['pending', 'cooking', 'ready', 'served', 'completed', 'cancelled']).optional(),
  type: z.enum(['dine_in', 'takeaway', 'delivery']).optional(),
  tableId: z.string().uuid().optional(),
  waiterId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  paymentStatus: z.enum(['unpaid', 'paid', 'refunded']).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderQuery = z.infer<typeof orderQuerySchema>;
