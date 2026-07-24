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
import {
  orderItemStatusEnum,
  orderPriorityEnum,
  orderStatusEnum,
  orderTypeEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  reservationStatusEnum,
  tableShapeEnum,
  tableStatusEnum,
} from './enums';
import { users } from './auth';
import { menuItems } from './menu';
import { customers } from './people';

/**
 * `positionX` / `positionY` are percentage coordinates (0–100) on the floor
 * canvas, which keeps the layout responsive at any viewport size.
 */
export const restaurantTables = pgTable(
  'restaurant_tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    label: varchar('label', { length: 24 }).notNull().unique(),
    capacity: integer('capacity').notNull().default(4),
    section: varchar('section', { length: 60 }).notNull().default('Main Hall'),
    status: tableStatusEnum('status').notNull().default('available'),
    shape: tableShapeEnum('shape').notNull().default('square'),
    positionX: numeric('position_x', { precision: 6, scale: 2 }).notNull().default('10'),
    positionY: numeric('position_y', { precision: 6, scale: 2 }).notNull().default('10'),
    assignedWaiterId: uuid('assigned_waiter_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('restaurant_tables_status_idx').on(table.status),
    sectionIdx: index('restaurant_tables_section_idx').on(table.section),
  }),
);

/**
 * Lifecycle timestamps are stored as discrete columns rather than a status log
 * because every analytics feature (kitchen heatmap, wait time, health score)
 * measures the gap between two specific transitions.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderNumber: varchar('order_number', { length: 24 }).notNull().unique(),
    type: orderTypeEnum('type').notNull().default('dine_in'),
    status: orderStatusEnum('status').notNull().default('pending'),
    priority: orderPriorityEnum('priority').notNull().default('normal'),

    tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    waiterId: uuid('waiter_id').references(() => users.id, { onDelete: 'set null' }),
    chefId: uuid('chef_id').references(() => users.id, { onDelete: 'set null' }),

    guestCount: integer('guest_count').notNull().default(1),
    subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull().default('0'),
    taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 12, scale: 2 }).notNull().default('0'),

    paymentMethod: paymentMethodEnum('payment_method'),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('unpaid'),

    deliveryAddress: text('delivery_address'),
    notes: text('notes'),
    cancelReason: text('cancel_reason'),

    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    cookingStartedAt: timestamp('cooking_started_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    servedAt: timestamp('served_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('orders_status_idx').on(table.status),
    placedAtIdx: index('orders_placed_at_idx').on(table.placedAt),
    tableIdx: index('orders_table_idx').on(table.tableId),
    customerIdx: index('orders_customer_idx').on(table.customerId),
    waiterIdx: index('orders_waiter_idx').on(table.waiterId),
    typeIdx: index('orders_type_idx').on(table.type),
  }),
);

/**
 * `nameSnapshot` and `unitPrice` are copied at order time so historical bills
 * stay accurate after the menu is re-priced or an item is deleted.
 */
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    menuItemId: uuid('menu_item_id').references(() => menuItems.id, { onDelete: 'set null' }),
    nameSnapshot: varchar('name_snapshot', { length: 140 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
    quantity: integer('quantity').notNull().default(1),
    lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
    status: orderItemStatusEnum('status').notNull().default('queued'),
    notes: text('notes'),
    prepTimeMinutes: integer('prep_time_minutes').notNull().default(15),
    startedAt: timestamp('started_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdx: index('order_items_order_idx').on(table.orderId),
    menuItemIdx: index('order_items_menu_item_idx').on(table.menuItemId),
    statusIdx: index('order_items_status_idx').on(table.status),
  }),
);

export const reservations = pgTable(
  'reservations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reservationCode: varchar('reservation_code', { length: 24 }).notNull().unique(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    tableId: uuid('table_id').references(() => restaurantTables.id, { onDelete: 'set null' }),
    customerName: varchar('customer_name', { length: 120 }).notNull(),
    customerPhone: varchar('customer_phone', { length: 32 }).notNull(),
    customerEmail: varchar('customer_email', { length: 160 }),
    partySize: integer('party_size').notNull().default(2),
    reservedFor: timestamp('reserved_for', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(90),
    status: reservationStatusEnum('status').notNull().default('pending'),
    specialRequest: text('special_request'),
    seatedAt: timestamp('seated_at', { withTimezone: true }),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reservedForIdx: index('reservations_reserved_for_idx').on(table.reservedFor),
    statusIdx: index('reservations_status_idx').on(table.status),
    phoneIdx: index('reservations_phone_idx').on(table.customerPhone),
  }),
);

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    rating: smallint('rating').notNull(),
    foodRating: smallint('food_rating'),
    serviceRating: smallint('service_rating'),
    ambienceRating: smallint('ambience_rating'),
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdx: index('feedback_order_idx').on(table.orderId),
    customerIdx: index('feedback_customer_idx').on(table.customerId),
    createdAtIdx: index('feedback_created_at_idx').on(table.createdAt),
  }),
);

export type RestaurantTableRow = typeof restaurantTables.$inferSelect;
export type OrderRow = typeof orders.$inferSelect;
export type OrderItemRow = typeof orderItems.$inferSelect;
export type ReservationRow = typeof reservations.$inferSelect;
export type FeedbackRow = typeof feedback.$inferSelect;
