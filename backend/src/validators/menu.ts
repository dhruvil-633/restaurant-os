import { z } from 'zod';
import { listQuerySchema, moneySchema } from './common';

export const createCategorySchema = z.object({
  name: z.string().trim().min(2, 'Enter a category name').max(100),
  type: z.enum(['food', 'drinks', 'desserts']).default('food'),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  imageUrl: z.string().url().max(500).optional().or(z.literal('')),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createMenuItemSchema = z.object({
  categoryId: z.string().uuid('Choose a category'),
  name: z.string().trim().min(2, 'Enter a dish name').max(140),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  price: moneySchema,
  cost: moneySchema.default(0),
  imageUrl: z.string().url().max(500).optional().or(z.literal('')),
  prepTimeMinutes: z.coerce.number().int().min(1, 'At least 1 minute').max(240).default(15),
  calories: z.coerce.number().int().min(0).max(10_000).optional(),
  spiceLevel: z.coerce.number().int().min(0).max(3).default(0),
  isVegetarian: z.boolean().default(false),
  isAvailable: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const updateMenuItemSchema = createMenuItemSchema.partial();

export const menuItemQuerySchema = listQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  type: z.enum(['food', 'drinks', 'desserts']).optional(),
  isAvailable: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  isVegetarian: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
});

export const recipeSchema = z.object({
  ingredients: z
    .array(
      z.object({
        ingredientId: z.string().uuid(),
        quantity: z.coerce.number().positive('Quantity must be greater than zero'),
      }),
    )
    .max(40),
});

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type MenuItemQuery = z.infer<typeof menuItemQuerySchema>;
