import type { PrismaClient } from '@prisma/client';
import { maybeScheduleEmailFallback } from '../utils/emailFallbackScheduler';
import { publishNotificationEventsToMany } from '../utils/notificationStream';
import { unreadNotificationsCache } from '../utils/unreadNotificationsCache';
import { logger } from '../utils/logger';

interface PublishedNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
}

/** Publish post-commit effects for notification rows already committed by a
 * Go job (or its SQL fallback). Push itself remains in the durable dispatch
 * worker; this function only refreshes live/read-side channels. */
export async function publishDurableNotifications(
  prisma: PrismaClient,
  notificationIds: string[],
  label: string
): Promise<void> {
  if (notificationIds.length === 0) return;

  try {
    const created: PublishedNotification[] = [];
    for (let offset = 0; offset < notificationIds.length; offset += 500) {
      const rows = await prisma.notification.findMany({
        where: { id: { in: notificationIds.slice(offset, offset + 500) } },
        select: { id: true, userId: true, type: true, title: true, body: true, data: true },
      });
      created.push(...rows);
    }

    const recipientIds = Array.from(new Set(created.map(row => row.userId)));
    for (let offset = 0; offset < recipientIds.length; offset += 50) {
      await Promise.all(
        recipientIds.slice(offset, offset + 50).map(userId => unreadNotificationsCache.invalidate(userId))
      );
    }

    for (const row of created) maybeScheduleEmailFallback(row.userId, row.type);

    if (created.length > 0) {
      const entries = created.map(row => ({
        userId: row.userId,
        event: {
          type: 'notification' as const,
          action: 'created' as const,
          notificationId: row.id,
          notificationType: row.type,
          title: row.title,
          body: row.body,
          data: row.data && typeof row.data === 'object' && !Array.isArray(row.data)
            ? row.data as Record<string, unknown>
            : null,
        },
      }));
      // Keep Redis/SSE concurrency bounded for jobs that can create thousands
      // of notifications in one run. Await the final chunk so the short-lived
      // script does not close its Redis subscriber before publication settles.
      for (let offset = 0; offset < entries.length; offset += 500) {
        await publishNotificationEventsToMany(entries.slice(offset, offset + 500));
      }
    }
  } catch (error) {
    // The DB transition and notification rows are committed already. A failed
    // cache/SSE/email side effect must not rerun the write job.
    logger.error(`${label} post-commit notification fan-out failed`, { error });
  }
}
