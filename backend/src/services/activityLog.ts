import { db } from '../db';
import { activityLogs } from '../db/schema';
import { logger } from '../config/logger';
import { realtime } from '../socket';
import { SOCKET_EVENTS } from '../socket/events';

export interface ActivityInput {
  userId?: string | null;
  actorName?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * Append-only event stream that powers Restaurant Replay and the dashboard
 * activity feed. Logging is best-effort: an audit write must never roll back
 * the business action that produced it.
 */
export async function recordActivity(input: ActivityInput): Promise<void> {
  try {
    const [entry] = await db
      .insert(activityLogs)
      .values({
        userId: input.userId ?? null,
        actorName: input.actorName ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        description: input.description,
        metadata: input.metadata ?? null,
      })
      .returning();

    if (entry) {
      realtime.toManagement(SOCKET_EVENTS.ACTIVITY_LOGGED, {
        id: entry.id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        description: entry.description,
        actorName: entry.actorName,
        occurredAt: entry.occurredAt.toISOString(),
      });
    }
  } catch (error) {
    logger.warn('Failed to record activity log entry', error);
  }
}
