/**
 * Called by notificationsRepository right after an in-app notification row is
 * written. Fire-and-forget and exception-proof: a scheduling failure must
 * never fail the action that produced the notification.
 *
 * Does nothing unless the queue is enabled AND the type may escalate to email
 * (see notificationEmailFallback.ts). Whether THIS user wants the email is
 * decided when the job runs, not here — that keeps the write path free of an
 * extra user lookup per notification, and the per-user jobId bounds the job
 * count to one pending check per user per window.
 */
import { env } from '../../config/env';
import { logger } from './logger';
import { isEmailFallbackType } from './notificationEmailFallback';

export function maybeScheduleEmailFallback(userId: string, type: string): void {
  if (env.notificationQueue?.enabled !== true) return;
  if (!isEmailFallbackType(type)) return;
  void import('../queue/notificationQueue')
    .then((q) => q.scheduleEmailFallback(userId))
    .catch((err) =>
      logger.warn('Email fallback scheduling failed', {
        userId,
        err: err instanceof Error ? err.message : String(err),
      }),
    );
}
