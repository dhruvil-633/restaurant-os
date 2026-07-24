import { db } from '../db';
import { notifications } from '../db/schema';
import { logger } from '../config/logger';
import { realtime } from '../socket';
import { SOCKET_EVENTS } from '../socket/events';
import type { UserRole } from '../types/roles';

type NotificationType =
  | 'order_created'
  | 'order_ready'
  | 'order_completed'
  | 'order_cancelled'
  | 'reservation_created'
  | 'reservation_reminder'
  | 'inventory_low'
  | 'inventory_expiry'
  | 'feedback_received'
  | 'system';

export interface NotificationInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  payload?: Record<string, unknown>;
  /** Send to one account… */
  userId?: string;
  /** …or to everyone holding a role. */
  targetRole?: UserRole;
}

/** Persists a notification and pushes it to the matching sockets immediately. */
export async function createNotification(input: NotificationInput): Promise<void> {
  try {
    const [row] = await db
      .insert(notifications)
      .values({
        userId: input.userId ?? null,
        targetRole: input.targetRole ?? null,
        type: input.type,
        title: input.title,
        message: input.message,
        link: input.link ?? null,
        payload: input.payload ?? null,
      })
      .returning();

    if (!row) return;

    const wirePayload = {
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      link: row.link,
      payload: row.payload,
      isRead: row.isRead,
      createdAt: row.createdAt.toISOString(),
    };

    if (input.userId) {
      realtime.toUser(input.userId, SOCKET_EVENTS.NOTIFICATION_NEW, wirePayload);
    } else if (input.targetRole) {
      realtime.toRole(input.targetRole, SOCKET_EVENTS.NOTIFICATION_NEW, wirePayload);
    } else {
      realtime.toAll(SOCKET_EVENTS.NOTIFICATION_NEW, wirePayload);
    }
  } catch (error) {
    logger.warn('Failed to create notification', error);
  }
}

/** Fan-out helper for alerts that several roles need to see. */
export async function notifyRoles(
  roles: readonly UserRole[],
  input: Omit<NotificationInput, 'targetRole' | 'userId'>,
): Promise<void> {
  await Promise.all(roles.map((role) => createNotification({ ...input, targetRole: role })));
}
