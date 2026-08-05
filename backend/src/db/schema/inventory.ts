import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { restaurants } from './tenant';
import {
  inventoryTransactionTypeEnum,
  inventoryUnitEnum,
  purchaseStatusEnum,
  wasteReasonEnum,
} from './enums';
import { users } from './auth';
import { menuItems } from './menu';
import { orders } from './operations';

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Owning tenant. Nullable during the additive migration; every
     *  existing row is backfilled to the default restaurant. */
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, {
      onDelete: 'cascade',
    }),
    name: varchar('name', { length: 140 }).notNull(),
    contactName: varchar('contact_name', { length: 120 }),
    phone: varchar('phone', { length: 32 }),
    email: varchar('email', { length: 160 }),
    address: text('address'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    activeIdx: index('suppliers_active_idx').on(table.isActive),
  }),
);

export const ingredients = pgTable(
  'ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Owning tenant. Nullable during the additive migration; every
     *  existing row is backfilled to the default restaurant. */
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, {
      onDelete: 'cascade',
    }),
    name: varchar('name', { length: 140 }).notNull().unique(),
    category: varchar('category', { length: 80 }).notNull().default('General'),
    unit: inventoryUnitEnum('unit').notNull().default('kg'),
    currentStock: numeric('current_stock', { precision: 12, scale: 3 }).notNull().default('0'),
    minStock: numeric('min_stock', { precision: 12, scale: 3 }).notNull().default('0'),
    maxStock: numeric('max_stock', { precision: 12, scale: 3 }).notNull().default('0'),
    costPerUnit: numeric('cost_per_unit', { precision: 12, scale: 2 }).notNull().default('0'),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    storageLocation: varchar('storage_location', { length: 80 }).notNull().default('Dry Store'),
    expiryDate: date('expiry_date'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    supplierIdx: index('ingredients_supplier_idx').on(table.supplierId),
    categoryIdx: index('ingredients_category_idx').on(table.category),
    expiryIdx: index('ingredients_expiry_idx').on(table.expiryDate),
  }),
);

/**
 * The recipe join — how much of each ingredient one serving of a dish consumes.
 * Serving an order decrements stock through these rows.
 */
export const menuItemIngredients = pgTable(
  'menu_item_ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  },
  (table) => ({
    pairIdx: uniqueIndex('menu_item_ingredients_pair_idx').on(table.menuItemId, table.ingredientId),
  }),
);

/**
 * A single append-only ledger for every stock movement. `quantity` is signed:
 * purchases are positive, consumption and waste are negative. Current stock on
 * the ingredient row is the materialised running total.
 */
export const inventoryTransactions = pgTable(
  'inventory_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    type: inventoryTransactionTypeEnum('type').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull().default('0'),
    totalCost: numeric('total_cost', { precision: 12, scale: 2 }).notNull().default('0'),
    wasteReason: wasteReasonEnum('waste_reason'),
    note: text('note'),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    performedById: uuid('performed_by_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ingredientIdx: index('inventory_transactions_ingredient_idx').on(table.ingredientId),
    typeIdx: index('inventory_transactions_type_idx').on(table.type),
    occurredAtIdx: index('inventory_transactions_occurred_at_idx').on(table.occurredAt),
  }),
);

export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Owning tenant. Nullable during the additive migration; every
     *  existing row is backfilled to the default restaurant. */
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, {
      onDelete: 'cascade',
    }),
    purchaseNumber: varchar('purchase_number', { length: 24 }).notNull().unique(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    status: purchaseStatusEnum('status').notNull().default('draft'),
    invoiceNumber: varchar('invoice_number', { length: 80 }),
    invoiceUrl: text('invoice_url'),
    totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull().default('0'),
    notes: text('notes'),
    orderedAt: timestamp('ordered_at', { withTimezone: true }).notNull().defaultNow(),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    supplierIdx: index('purchases_supplier_idx').on(table.supplierId),
    statusIdx: index('purchases_status_idx').on(table.status),
    orderedAtIdx: index('purchases_ordered_at_idx').on(table.orderedAt),
  }),
);

export const purchaseItems = pgTable(
  'purchase_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 12, scale: 2 }).notNull(),
    lineTotal: numeric('line_total', { precision: 14, scale: 2 }).notNull(),
  },
  (table) => ({
    purchaseIdx: index('purchase_items_purchase_idx').on(table.purchaseId),
  }),
);

export type SupplierRow = typeof suppliers.$inferSelect;
export type IngredientRow = typeof ingredients.$inferSelect;
export type InventoryTransactionRow = typeof inventoryTransactions.$inferSelect;
export type PurchaseRow = typeof purchases.$inferSelect;
export type PurchaseItemRow = typeof purchaseItems.$inferSelect;
