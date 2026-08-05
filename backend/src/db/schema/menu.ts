import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { restaurants } from './tenant';
import { menuCategoryTypeEnum } from './enums';

export const menuCategories = pgTable(
  'menu_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Owning tenant. Nullable during the additive migration; every
     *  existing row is backfilled to the default restaurant. */
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, {
      onDelete: 'cascade',
    }),
    name: varchar('name', { length: 100 }).notNull(),
    slug: varchar('slug', { length: 120 }).notNull().unique(),
    type: menuCategoryTypeEnum('type').notNull().default('food'),
    description: text('description'),
    imageUrl: text('image_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    typeIdx: index('menu_categories_type_idx').on(table.type),
  }),
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Owning tenant. Nullable during the additive migration; every
     *  existing row is backfilled to the default restaurant. */
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, {
      onDelete: 'cascade',
    }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => menuCategories.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 140 }).notNull(),
    description: text('description'),
    /** Menu price charged to the customer. */
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),
    /** Ingredient cost, used for margin and waste valuation. */
    cost: numeric('cost', { precision: 12, scale: 2 }).notNull().default('0'),
    imageUrl: text('image_url'),
    prepTimeMinutes: integer('prep_time_minutes').notNull().default(15),
    calories: integer('calories'),
    spiceLevel: smallint('spice_level').notNull().default(0),
    isVegetarian: boolean('is_vegetarian').notNull().default(false),
    isAvailable: boolean('is_available').notNull().default(true),
    isFeatured: boolean('is_featured').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    categoryIdx: index('menu_items_category_idx').on(table.categoryId),
    availableIdx: index('menu_items_available_idx').on(table.isAvailable),
    nameIdx: index('menu_items_name_idx').on(table.name),
  }),
);

export type MenuCategoryRow = typeof menuCategories.$inferSelect;
export type MenuItemRow = typeof menuItems.$inferSelect;
