import { z } from 'zod';

export const createTableSchema = z.object({
  label: z.string().trim().min(1, 'Enter a table label').max(24),
  capacity: z.coerce.number().int().min(1, 'At least one seat').max(30).default(4),
  section: z.string().trim().min(1).max(60).default('Main Hall'),
  shape: z.enum(['square', 'round', 'rectangle']).default('square'),
  positionX: z.coerce.number().min(0).max(100).default(10),
  positionY: z.coerce.number().min(0).max(100).default(10),
  status: z.enum(['available', 'occupied', 'reserved', 'cleaning']).default('available'),
  isActive: z.boolean().default(true),
});

export const updateTableSchema = createTableSchema.partial();

export const updateTableStatusSchema = z.object({
  status: z.enum(['available', 'occupied', 'reserved', 'cleaning']),
});

export const assignWaiterSchema = z.object({
  waiterId: z.string().uuid().nullable(),
});

/** Bulk position save used when the floor plan is rearranged by dragging. */
export const updateFloorLayoutSchema = z.object({
  tables: z
    .array(
      z.object({
        id: z.string().uuid(),
        positionX: z.coerce.number().min(0).max(100),
        positionY: z.coerce.number().min(0).max(100),
      }),
    )
    .min(1)
    .max(200),
});

export const tableQuerySchema = z.object({
  status: z.enum(['available', 'occupied', 'reserved', 'cleaning']).optional(),
  section: z.string().trim().max(60).optional(),
});
