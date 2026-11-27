import { maybeScheduleEmailFallback } from '../email/emailFallbackScheduler';
import { logger } from '../observability/logger';
import { unreadNotificationsCache } from '../cache/unreadNotificationsCache';
import {
  publishNotificationEvent,
  publishNotificationEventsToMany,
  type LiveStreamEvent,
} from '../realtime/notificationStream';
import { asPlainObject } from '../utils/asPlainObject';

/** Small post-commit projection used by every notification writer. */
export interface NotificationLifecycleRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
}

const CACHE_BATCH_SIZE = 50;
const EVENT_BATCH_SIZE = 500;

async function invalidateRecipients(userIds: string[], label: string): Promise<void> {
  const unique = Array.from(new Set(userIds));
  for (let offset = 0; offset < unique.length; offset += CACHE_BATCH_SIZE) {
    const batch = unique.slice(offset, offset + CACHE_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(userId => unreadNotificationsCache.invalidate(userId)));
    const failures = results.filter(result => result.status === 'rejected').length;
    if (failures > 0) {
      logger.warn(`${label}: unread notification cache invalidation partially failed`, {
        batchSize: batch.length,
        failures,
      });
    }
  }
}

/**
 * One post-commit path for rows created by Express, BullMQ adapters, the
 * transactional outbox, maintenance jobs, or the Go durable worker.
 * Database writes remain owned by their originating transaction/worker.
 */
export async function publishCreatedNotifications(
  records: readonly NotificationLifecycleRecord[],
  label = 'notifications'
): Promise<void> {
  if (records.length === 0) return;

  await invalidateRecipients(records.map(record => record.userId), label);
  for (const record of records) maybeScheduleEmailFallback(record.userId, record.type);

  for (let offset = 0; offset < records.length; offset += EVENT_BATCH_SIZE) {
    const batch = records.slice(offset, offset + EVENT_BATCH_SIZE);
    const entries = batch.map(record => ({
      userId: record.userId,
      event: {
        type: 'notification' as const,
        action: 'created' as const,
        notificationId: record.id,
        notificationType: record.type,
        title: record.title,
        body: record.body,
        data: asPlainObject(record.data),
      },
    }));
    try {
      await publishNotificationEventsToMany(entries);
    } catch (error) {
      // The notification row is already durable. Do not cause the originating
      // operation or outbox acknowledgement to retry a committed DB write.
      logger.warn(`${label}: notification SSE publish failed after durable insert`, {
        batchSize: batch.length,
        error,
      });
    }
  }
}

/**
 * Publish read/update/delete transitions after their DB mutation commits.
 * A missing notificationId means a bulk transition and tells clients to
 * refetch the durable list rather than attempting a local partial patch.
 */
export async function publishNotificationStateChanges(input: {
  userIds: readonly string[];
  action: Extract<LiveStreamEvent, { type: 'notification' }>['action'];
  notificationId?: string;
  changed?: boolean;
  label?: string;
}): Promise<void> {
  const label = input.label ?? 'notifications';
  const userIds = Array.from(new Set(input.userIds.filter(userId => typeof userId === 'string' && userId.length > 0)));
  if (userIds.length === 0) return;

  const STATE_BATCH_SIZE = 500;
  for (let offset = 0; offset < userIds.length; offset += STATE_BATCH_SIZE) {
    const batch = userIds.slice(offset, offset + STATE_BATCH_SIZE);
    await invalidateRecipients(batch, label);
    if (input.changed === false) continue;

    const event: LiveStreamEvent = {
      type: 'notification',
      action: input.action,
      ...(input.notificationId ? { notificationId: input.notificationId } : {}),
    };
    try {
      await publishNotificationEventsToMany(batch.map(userId => ({ userId, event })));
    } catch (error) {
      logger.warn(`${label}: notification state SSE publish failed after DB commit`, {
        batchSize: batch.length,
        action: input.action,
        notificationId: input.notificationId,
        error,
      });
    }
  }
}

export async function publishNotificationStateChange(input: {
  userId: string;
  action: Extract<LiveStreamEvent, { type: 'notification' }>['action'];
  notificationId?: string;
  changed?: boolean;
  label?: string;
}): Promise<void> {
  await publishNotificationStateChanges({ ...input, userIds: [input.userId] });
}
