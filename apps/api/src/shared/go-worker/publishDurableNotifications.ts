import type { PrismaClient } from '@prisma/client';
import { publishCreatedNotifications } from '../notifications/notificationLifecycle';
import { logger } from '../observability/logger';

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
    for (let offset = 0; offset < notificationIds.length; offset += 500) {
      const rows = await prisma.notification.findMany({
        where: { id: { in: notificationIds.slice(offset, offset + 500) } },
        select: { id: true, userId: true, type: true, title: true, body: true, data: true },
      });
      await publishCreatedNotifications(rows, `${label} durable notifications`);
    }
  } catch (error) {
    // The DB transition and notification rows are committed already. The
    // lifecycle dispatcher itself isolates cache/SSE/email failures; only a
    // query/adapter failure should be logged here.
    logger.error(`${label} post-commit notification fan-out failed`, { error });
  }
}
