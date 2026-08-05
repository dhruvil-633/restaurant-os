import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { restaurants } from './tenant';
import { notificationTypeEnum, userRoleEnum } from './enums';
import { users } from './auth';

/**
 * A notification targets either one user or a whole role (e.g. every chef).
 * Exactly one of `userId` / `targetRole` is set by the notification service.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Owning tenant. Nullable during the additive migration; every
     *  existing row is backfilled to the default restaurant. */
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    targetRole: userRoleEnum('target_role'),
    type: notificationTypeEnum('type').notNull().default('system'),
    title: varchar('title', { length: 160 }).notNull(),
    message: text('message').notNull(),
    link: varchar('link', { length: 255 }),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index('notifications_user_idx').on(table.userId),
    roleIdx: index('notifications_role_idx').on(table.targetRole),
    readIdx: index('notifications_read_idx').on(table.isRead),
    createdAtIdx: index('notifications_created_at_idx').on(table.createdAt),
  }),
);

/**
 * The event stream behind Restaurant Replay. Every meaningful state change is
 * appended here with enough payload to reconstruct the floor at any timestamp.
 */
export const activityLogs = pgTable(
  'activity_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Owning tenant. Nullable during the additive migration; every
     *  existing row is backfilled to the default restaurant. */
    restaurantId: uuid('restaurant_id').references(() => restaurants.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    actorName: varchar('actor_name', { length: 120 }),
    action: varchar('action', { length: 80 }).notNull(),
    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: uuid('entity_id'),
    description: text('description').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    occurredAtIdx: index('activity_logs_occurred_at_idx').on(table.occurredAt),
    entityIdx: index('activity_logs_entity_idx').on(table.entityType, table.entityId),
    actionIdx: index('activity_logs_action_idx').on(table.action),
  }),
);

export const settings = pgTable('settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Owning tenant. Nullable during the additive migration; every
   *  existing row is backfilled to the default restaurant. */
  restaurantId: uuid('restaurant_id').references(() => restaurants.id, {
    onDelete: 'cascade',
  }),
  key: varchar('key', { length: 80 }).notNull().unique(),
  value: jsonb('value').$type<unknown>().notNull(),
  description: text('description'),
  updatedById: uuid('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationRow = typeof notifications.$inferSelect;
export type ActivityLogRow = typeof activityLogs.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
