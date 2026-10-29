import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { restaurants } from './tenant';
import { paymentMethodEnum } from './enums';
import { users } from './auth';
import { menuItems } from './menu';
import { customers } from './people';
import { orders } from './operations';

/**
 * One row per tender taken against a bill.
 *
 * `orders.paymentMethod` only ever held a single method, which cannot express
 * a table splitting four ways or paying half cash half card. That column stays
 * as the summary of the last tender so existing screens keep working; this
 * ledger is the truth, and the two are reconciled when a bill is settled.
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    method: paymentMethodEnum('method').notNull(),
    /** Who the split belongs to, e.g. "Guest 2" — free text by design. */
    payerLabel: varchar('payer_label', { length: 60 }),
    reference: varchar('reference', { length: 80 }),
    receivedById: uuid('received_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orderIdx: index('payments_order_idx').on(table.orderId),
    createdAtIdx: index('payments_created_at_idx').on(table.createdAt),
  }),
);

export const rewardTypeEnum = pgEnum('reward_type', [
  'discount_amount',
  'discount_percent',
  'free_item',
]);

/** What a guest can exchange loyalty points for. */
export const loyaltyRewards = pgTable(
  'loyalty_rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    pointsCost: integer('points_cost').notNull(),
    type: rewardTypeEnum('type').notNull().default('discount_amount'),
    /** Rupees for discount_amount, percent for discount_percent, unused for free_item. */
    value: numeric('value', { precision: 12, scale: 2 }).notNull().default('0'),
    menuItemId: uuid('menu_item_id').references(() => menuItems.id, { onDelete: 'set null' }),
    /** Stops a 100%-off reward being created by a slipped decimal. */
    maxDiscount: numeric('max_discount', { precision: 12, scale: 2 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    activeIdx: index('loyalty_rewards_active_idx').on(table.isActive),
  }),
);

/** Append-only: points are spent here, never edited back. */
export const rewardRedemptions = pgTable(
  'reward_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    rewardId: uuid('reward_id').references(() => loyaltyRewards.id, { onDelete: 'set null' }),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
    rewardName: varchar('reward_name', { length: 120 }).notNull(),
    pointsSpent: integer('points_spent').notNull(),
    discountApplied: numeric('discount_applied', { precision: 12, scale: 2 }).notNull().default('0'),
    redeemedById: uuid('redeemed_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIdx: index('reward_redemptions_customer_idx').on(table.customerId),
    orderIdx: index('reward_redemptions_order_idx').on(table.orderId),
  }),
);

export type PaymentRow = typeof payments.$inferSelect;
export type LoyaltyRewardRow = typeof loyaltyRewards.$inferSelect;
export type RewardRedemptionRow = typeof rewardRedemptions.$inferSelect;
