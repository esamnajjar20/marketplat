import type { Request, Response } from 'express';
import { prisma } from '../../../config/prisma';
import { runProductionScheduledJob } from '../../../scripts/childJobRunner';
import { unreadNotificationsCache } from '../../../shared/cache/unreadNotificationsCache';
import { publishDurableNotifications } from '../../../shared/go-worker/publishDurableNotifications';
import { fcmDeviceTokensRepository } from '../../../shared/notifications/fcmDeviceTokensRepository';
import { fcmPushService } from '../../../shared/notifications/fcmPushService';
import { pushService } from '../../../shared/notifications/pushService';
import { logger } from '../../../shared/observability/logger';
import { publishNotificationEventsToMany } from '../../../shared/realtime/notificationStream';
import {
  parseDurableNotificationsRequest,
  parseOutboxNotificationsRequest,
  parsePushTargetRequest,
  parseScheduledJobRequest,
} from './internal-go-worker.validation';

/**
 * Handlers for the callbacks the Go-owned worker makes into this process.
 * Authentication is applied by the router (requireGoWorkerToken); these
 * handlers only validate the body and delegate.
 */
export const internalGoWorkerController = {
  /**
   * Internal adapter called only by the Go-owned scheduler. It accepts an
   * allowlisted script name, never an arbitrary command/path, and executes the
   * compiled production script so its existing Go-first/Express-fallback and
   * post-commit hooks remain unchanged.
   */
  async runScheduledJob(req: Request, res: Response): Promise<void> {
    const parsed = parseScheduledJobRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { jobName, scheduledFor } = parsed.value;
    const controller = new AbortController();
    const abortOnDisconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once('aborted', abortOnDisconnect);
    res.once('close', abortOnDisconnect);

    try {
      await runProductionScheduledJob(jobName, scheduledFor, controller.signal);
      if (!res.headersSent && !res.destroyed) {
        res.status(200).json({ jobName, scheduledFor, status: 'completed' });
      }
    } catch (error) {
      logger.error('Go-owned scheduled job adapter failed', {
        jobName,
        scheduledFor,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent && !res.destroyed) res.status(500).json({ error: 'scheduled job failed' });
    } finally {
      req.off('aborted', abortOnDisconnect);
      res.off('close', abortOnDisconnect);
    }
  },

  /**
   * Post-commit adapter used when Go owns Outbox processing. Database rows and
   * push-dispatch intents have already committed in Go; Express retains Redis
   * unread-cache invalidation and SSE/pub-sub because those publishers are
   * process-aware and already coordinate API instances through Redis.
   */
  async publishOutboxNotifications(req: Request, res: Response): Promise<void> {
    const parsed = parseOutboxNotificationsRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { eventId, notifications } = parsed.value;
    const recipientIds = Array.from(new Set(notifications.map(item => item.userId)));
    const invalidations = await Promise.allSettled(
      recipientIds.map(userId => unreadNotificationsCache.invalidate(userId))
    );
    const invalidationFailures = invalidations.filter(result => result.status === 'rejected').length;
    if (invalidationFailures > 0) {
      logger.warn('Go outbox callback unread-cache invalidation partially failed', {
        eventId,
        recipients: recipientIds.length,
        failures: invalidationFailures,
      });
    }

    try {
      await publishNotificationEventsToMany(
        notifications.map(item => ({
          userId: item.userId,
          event: {
            type: 'notification' as const,
            action: 'created' as const,
            notificationId: item.id,
            notificationType: item.type,
            title: item.title,
            body: item.body,
            data: item.data,
          },
        }))
      );
      res.status(200).json({ eventId, published: notifications.length });
    } catch (error) {
      logger.warn('Go outbox callback SSE publish failed after durable commit', { eventId, error });
      res.status(202).json({ eventId, published: 0, durable: true });
    }
  },

  /**
   * Post-commit read-side fan-out for durable notifications created directly
   * by Go jobs. The notification and push-dispatch rows are already committed;
   * this only invalidates unread-count caches and publishes SSE events.
   */
  async publishDurableNotifications(req: Request, res: Response): Promise<void> {
    const parsed = parseDurableNotificationsRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { notificationIds } = parsed.value;
    await publishDurableNotifications(prisma, notificationIds, 'inventory-monitor');
    res.status(200).json({ accepted: notificationIds.length });
  },

  /**
   * Readiness probe for the authenticated Go push worker. Confirms the API's
   * narrow provider adapter is deployed before Go may pause the Express
   * fallback consumer. Auth is enforced by the router.
   */
  pushAdapterHealth(_req: Request, res: Response): void {
    res.status(200).json({ ready: true });
  },

  /**
   * Per-target provider adapter used by the Go-owned durable push dispatcher.
   * Go owns claims, target leases, retry timing and delivery ledger; Express
   * retains the Web Push cryptography/VAPID implementation and the Firebase
   * Admin fallback when Go does not have a valid service account.
   */
  async sendPushTarget(req: Request, res: Response): Promise<void> {
    const parsed = parsePushTargetRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const { channel, userId, targetId, payload } = parsed.value;
    try {
      let outcome: string;
      if (channel === 'WEB_PUSH') {
        outcome = await pushService.sendToSubscriptionForOutbox(targetId, userId, payload);
      } else {
        const token = await fcmDeviceTokensRepository.findByIdForUser(targetId, userId);
        outcome = token
          ? await fcmPushService.sendToToken(token, {
              title: payload.title,
              body: payload.body,
              url: payload.url,
              tag: payload.tag,
            })
          : 'missing';
      }
      res.status(200).json({ outcome });
    } catch (error) {
      logger.warn('Go push provider adapter failed; durable target will retry', {
        channel,
        targetId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(503).json({ error: 'push provider adapter unavailable' });
    }
  },
};
