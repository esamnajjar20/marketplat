import { reportBackgroundFailure } from '../utils/backgroundTask';
/**
 * Job handlers for the `notifications` queue.
 *
 * Contract with BullMQ: returning = done (never retried), throwing = retry
 * with the queue's backoff. So a handler only throws for failures a later
 * attempt can fix (transient provider errors, a failed email send).
 *
 * This file must not import notificationQueue.ts at module load (that module
 * imports this one); the few producer calls needed here use a lazy import.
 */
import type { Job } from 'bullmq';
import type { NotificationType } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { redis } from '../../config/redis';
import { logger } from '../utils/logger';
import { pushService } from '../utils/pushService';
import { fcmPushService } from '../utils/fcmPushService';
import { pushSubscriptionsRepository } from '../utils/pushSubscriptionsRepository';
import { fcmDeviceTokensRepository } from '../utils/fcmDeviceTokensRepository';
import { emailService } from '../utils/emailService';
import { presence } from '../utils/presence';
import { evaluateQuietHours } from '../utils/quietHours';
import {
  DIGEST_MAX_ITEMS,
  EMAIL_FALLBACK_TYPES,
  emailFallbackGapKey,
  summarizeDigest,
  userWantsEmailFallback,
} from '../utils/notificationEmailFallback';
import type {
  EmailFallbackJobData,
  FanoutJobData,
  FcmJobData,
  WebJobData,
} from './notificationJobs';

const DIGEST_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Quiet hours may push the email check back; DST drift can need a second hop, never more. */
const MAX_EMAIL_DEFERRALS = 2;

// ── fanout ────────────────────────────────────────────────────────────

export async function processFanout(job: Job<FanoutJobData>): Promise<void> {
  const { userId, payload, deferred } = job.data;
  const { getNotificationQueue } = await import('./notificationQueue');

  // A deferred job re-checks the window when it wakes: the user may have
  // changed or disabled quiet hours, or DST may have shifted the wall clock.
  if (deferred && !payload.bypassQuietHours) {
    const decision = await pushService.quietHoursDecision(userId, payload.urgent);
    if (decision.blocked) {
      // The finished job's id is still taken while it runs, so hop with a derived id.
      await getNotificationQueue().add(
        'fanout',
        { userId, payload, deferred: true },
        {
          delay: decision.resumeInMs + Math.floor(Math.random() * 60_000),
          ...(job.id ? { jobId: `${job.id}_r` } : {}),
        },
      );
      return;
    }
  }

  const [web, native] = await Promise.all([
    env.webPush.isConfigured ? pushSubscriptionsRepository.findManyByUserId(userId) : [],
    env.fcm.isConfigured ? fcmDeviceTokensRepository.findManyByUserId(userId) : [],
  ]);
  if (!env.webPush.isConfigured) {
    logger.warn('[PUSH NOT SENT — VAPID not configured] Would have sent push', {
      userId,
      title: payload.title,
    });
  }
  if (!env.fcm.isConfigured) {
    logger.warn('[FCM PUSH NOT SENT — Firebase not configured] Would have sent push', {
      userId,
      title: payload.title,
    });
  }

  const jobs = [
    ...web.map((sub) => ({
      name: 'web' as const,
      data: { userId, subscriptionId: sub.id, payload } satisfies WebJobData,
    })),
    ...native.map((tok) => ({
      name: 'fcm' as const,
      data: { userId, tokenId: tok.id, payload } satisfies FcmJobData,
    })),
  ];
  if (jobs.length > 0) await getNotificationQueue().addBulk(jobs);
}

// ── per-device delivery ───────────────────────────────────────────────

export async function processWeb(job: Job<WebJobData>): Promise<void> {
  const { userId, subscriptionId, payload } = job.data;
  const sub = await pushSubscriptionsRepository.findByIdForUser(subscriptionId, userId);
  if (!sub) return; // unsubscribed, pruned, or moved to another account since enqueue

  const outcome = await pushService.sendToSubscription(sub, payload);
  if (outcome === 'transient') throw new Error('Web Push transient failure');
  // 'sent' | 'gone' (already pruned) | 'failed' (not retryable, already logged) | 'unconfigured'
}

export async function processFcm(job: Job<FcmJobData>): Promise<void> {
  const { userId, tokenId, payload } = job.data;
  const tok = await fcmDeviceTokensRepository.findByIdForUser(tokenId, userId);
  if (!tok) return;

  const outcome = await fcmPushService.sendToToken(tok, payload);
  if (outcome === 'transient') throw new Error('FCM transient failure');
}

// ── email fallback ────────────────────────────────────────────────────

/**
 * Runs `delay` after the first eligible notification of a window. Sends ONE
 * digest iff, right now: the user opted in, has a verified address, is not in
 * quiet hours, is not currently in the app, still has unread eligible
 * notifications, and has not been emailed within the gap. Anything else ends
 * the job quietly — the in-app bell remains the source of truth.
 */
export async function processEmailFallback(job: Job<EmailFallbackJobData>): Promise<void> {
  const { userId } = job.data;
  const deferrals = job.data.deferrals ?? 0;
  if (!env.email.isConfigured) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, emailVerified: true, isActive: true, notificationPreferences: true },
  });
  if (!user || !user.isActive || !user.emailVerified || !user.email) return;
  if (!userWantsEmailFallback(user.notificationPreferences)) return;

  const quiet = evaluateQuietHours(user.notificationPreferences, false);
  if (quiet.blocked) {
    if (deferrals >= MAX_EMAIL_DEFERRALS) return;
    const { scheduleEmailFallback } = await import('./notificationQueue');
    await scheduleEmailFallback(userId, deferrals + 1, quiet.resumeInMs + Math.floor(Math.random() * 60_000));
    return;
  }

  // Active in the app within the presence window: they can see the badge.
  const presenceMap = await presence.getPresence([userId]);
  if (presenceMap[userId]?.online) return;

  const where = {
    userId,
    readAt: null,
    type: { in: [...EMAIL_FALLBACK_TYPES] as NotificationType[] },
    createdAt: { gte: new Date(Date.now() - DIGEST_LOOKBACK_MS) },
  };
  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: DIGEST_MAX_ITEMS,
      select: { title: true, body: true },
    }),
    prisma.notification.count({ where }),
  ]);
  if (items.length === 0) return;

  // One email per user per gap window. SET NX is atomic across PM2 workers.
  const gapKey = emailFallbackGapKey(userId);
  const claimed = await redis.set(
    gapKey,
    '1',
    'EX',
    env.notificationQueue.emailFallbackGapMinutes * 60,
    'NX',
  );
  if (claimed !== 'OK') return;

  const sent = await emailService.sendNotificationDigestEmail(user.email, summarizeDigest(items, total));
  if (!sent) {
    // Release the claim so the retry (or the next notification) can try again.
    await redis.del(gapKey).catch((error) => reportBackgroundFailure('backend/src/shared/queue/notificationProcessors.ts', error));
    throw new Error('Notification digest email was not sent');
  }
}
