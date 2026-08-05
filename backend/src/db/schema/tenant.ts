import { boolean, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * A tenant. One row per restaurant sharing this deployment.
 *
 * Introduced after the system was already live single-tenant, so the migration
 * is deliberately additive: every existing row is backfilled to one default
 * restaurant, and `restaurantId` stays nullable until every query is scoped.
 * That way the running deployment keeps behaving exactly as before while the
 * scoping work lands incrementally.
 */
export const restaurants = pgTable(
  'restaurants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 140 }).notNull(),
    /** Public URL segment — /r/copper-spoon */
    slug: varchar('slug', { length: 160 }).notNull().unique(),
    address: text('address'),
    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 160 }),
    logoUrl: text('logo_url'),
    currency: varchar('currency', { length: 3 }).notNull().default('INR'),
    currencySymbol: varchar('currency_symbol', { length: 4 }).notNull().default('₹'),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Kolkata'),
    /** Guest ordering can be switched off per restaurant. */
    onlineOrderingEnabled: boolean('online_ordering_enabled').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugIdx: index('restaurants_slug_idx').on(table.slug),
    activeIdx: index('restaurants_active_idx').on(table.isActive),
  }),
);

export type RestaurantRow = typeof restaurants.$inferSelect;
export type NewRestaurantRow = typeof restaurants.$inferInsert;
