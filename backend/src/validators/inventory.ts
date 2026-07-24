import { z } from 'zod';
import { emailSchema, listQuerySchema, moneySchema, phoneSchema, quantitySchema } from './common';

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2, 'Enter a supplier name').max(140),
  contactName: z.string().trim().max(120).optional().or(z.literal('')),
  phone: phoneSchema.optional().or(z.literal('')),
  email: emailSchema.optional().or(z.literal('')),
  address: z.string().trim().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

export const updateSupplierSchema = createSupplierSchema.partial();

export const createIngredientSchema = z.object({
  name: z.string().trim().min(2, 'Enter an ingredient name').max(140),
  category: z.string().trim().min(2).max(80).default('General'),
  unit: z.enum(['kg', 'g', 'l', 'ml', 'piece', 'packet', 'bottle', 'dozen']).default('kg'),
  currentStock: quantitySchema.default(0),
  minStock: quantitySchema.default(0),
  maxStock: quantitySchema.default(0),
  costPerUnit: moneySchema.default(0),
  supplierId: z.string().uuid().optional().nullable(),
  storageLocation: z.string().trim().max(80).default('Dry Store'),
  expiryDate: z.coerce.date().optional().nullable(),
  isActive: z.boolean().default(true),
});

export const updateIngredientSchema = createIngredientSchema.partial();

export const stockAdjustmentSchema = z.object({
  quantity: z.coerce.number().refine((value) => value !== 0, 'Enter a non-zero quantity'),
  note: z.string().trim().max(300).optional().or(z.literal('')),
});

export const recordWasteSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: quantitySchema.refine((value) => value > 0, 'Enter how much was wasted'),
  reason: z.enum([
    'expired',
    'spoiled',
    'overcooked',
    'customer_return',
    'spillage',
    'preparation_error',
    'other',
  ]),
  note: z.string().trim().max(300).optional().or(z.literal('')),
});

export const createPurchaseSchema = z.object({
  supplierId: z.string().uuid('Choose a supplier'),
  invoiceNumber: z.string().trim().max(80).optional().or(z.literal('')),
  invoiceUrl: z.string().url().max(500).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  status: z.enum(['draft', 'ordered', 'received', 'cancelled']).default('ordered'),
  items: z
    .array(
      z.object({
        ingredientId: z.string().uuid(),
        quantity: quantitySchema.refine((value) => value > 0, 'Enter a quantity'),
        unitCost: moneySchema,
      }),
    )
    .min(1, 'Add at least one line item')
    .max(80),
});

export const receivePurchaseSchema = z.object({
  receivedAt: z.coerce.date().optional(),
});

export const ingredientQuerySchema = listQuerySchema.extend({
  category: z.string().trim().max(80).optional(),
  supplierId: z.string().uuid().optional(),
  lowStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  expiringSoon: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
});
