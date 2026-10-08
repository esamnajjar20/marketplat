import { reportBackgroundFailure } from '../utils/backgroundTask';
/**
 * BullMQ glue for the `notifications` queue ().
 *
 * Producers (`enqueuePush`, `deferPush`, `scheduleEmailFallback`) are called
 * from the request path through a lazy `import()` in pushService /
 * emailFallbackScheduler, only when NOTIFICATION_QUEUE_ENABLED=true. Every
 * producer is time-boxed and throws on failure; callers fall back to the
 * pre-inline behaviour, so a Redis hiccup never loses a push.
 *
 * The consumer (`startNotificationWorker`) runs in-process by default (PM2
 * cluster: each worker consumes, BullMQ's locks keep jobs single-delivery).
 */
import { Queue, Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { env } from '../../config/env';
import { createBullMqConnection } from '../../config/redis';
import { logger } from '../utils/logger';
import { recordFailedTask } from '../utils/failedBackgroundTasks';
import type { PushPayload } from '../utils/pushService';
import {
  NOTIFICATION_QUEUE_NAME,
  deferredPushJobId,
  emailFallbackJobId,
  type EmailFallbackJobData,
  type FanoutJobData,
  type FcmJobData,
  type NotificationJobData,
  type WebJobData,
} from './notificationJobs';
import {
  processEmailFallback,
  processFanout,
  processFcm,
  processWeb,
} from './notificationProcessors';

/** Producer calls must never hold a request open: past this, the caller falls back to inline delivery. */
const ENQUEUE_TIMEOUT_MS = 1_500;
/** Spread wake-ups so a whole timezone's quiet window ending doesn't fire in the same second. */
const DEFER_JITTER_MS = 60_000;
/** Retry schedule for a single device delivery: 5s, 10s, 20s, 40s. */
const DELIVERY_ATTEMPTS = 5;
const DELIVERY_BACKOFF_MS = 5_000;

let queue: Queue<NotificationJobData> | null = null;
let producerConn: Redis | null = null;
let worker: Worker<NotificationJobData> | null = null;
let workerConn: Redis | null = null;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

export function getNotificationQueue(): Queue<NotificationJobData> {
  if (queue) return queue;
  producerConn = createBullMqConnection('producer');
  queue = new Queue<NotificationJobData>(NOTIFICATION_QUEUE_NAME, {
    connection: producerConn,
    defaultJobOptions: {
      attempts: DELIVERY_ATTEMPTS,
      backoff: { type: 'exponential', delay: DELIVERY_BACKOFF_MS },
      // Redis runs noeviction: finished jobs must not accumulate. Completed
      // jobs are dropped (this also frees their custom jobId for reuse);
      // failures are kept briefly for inspection and are mirrored into
      // FailedBackgroundTask by the worker's 'failed' handler.
      removeOnComplete: true,
      removeOnFail: { age: 24 * 3600, count: 500 },
    },
  });
  queue.on('error', (err) => logger.error('Notification queue error', { err: err.message }));
  return queue;
}

/** Normal path: one fan-out job per push; the worker resolves devices and enqueues per-device jobs. */
export async function enqueuePush(userId: string, payload: PushPayload): Promise<void> {
  const data: FanoutJobData = { userId, payload };
  await withTimeout(getNotificationQueue().add('fanout', data), ENQUEUE_TIMEOUT_MS, 'enqueuePush');
}

/**
 * Quiet hours: hold the push until the window ends. Pushes that share a tag
 * (e.g. every message of one conversation) collapse into the LATEST one, so
 * the morning shows one banner with current copy instead of a stack.
 */
export async function deferPush(
  userId: string,
  payload: PushPayload,
  resumeInMs: number,
): Promise<void> {
  const q = getNotificationQueue();
  const jobId = deferredPushJobId(userId, payload.tag);
  const delay = Math.max(1_000, Math.round(resumeInMs)) + Math.floor(Math.random() * DEFER_JITTER_MS);

  await withTimeout(
    (async () => {
      // BullMQ ignores add() while ANY job with this id
      // exists. Clear the removable states; for 'active' (cannot remove) derive
      // a fresh id — the NEWEST copy must win. A stale 'waiting' job used to
      // silently swallow the user's most recent (and only) banner.
      let effectiveJobId = jobId;
      if (jobId) {
        const existing = await q.getJob(jobId);
        if (existing) {
          const state = await existing.getState();
          if (
            state === 'delayed' ||
            state === 'failed' ||
            state === 'completed' ||
            state === 'waiting'
          ) {
            await existing.remove().catch((error) => reportBackgroundFailure('backend/src/shared/queue/notificationQueue.ts', error));
          } else if (state === 'active') {
            effectiveJobId = `${jobId}_${Date.now()}`;
          }
        }
      }
      const data: FanoutJobData = { userId, payload, deferred: true };
      await q.add('fanout', data, { delay, ...(effectiveJobId ? { jobId: effectiveJobId } : {}) });
    })(),
    ENQUEUE_TIMEOUT_MS,
    'deferPush',
  );
}

/**
 * Email fallback: ensure ONE pending "still unread?" check exists for the
 * user. Later eligible notifications inside the window find the job already
 * there (same jobId → add() is a no-op) and simply join its digest.
 */
export async function scheduleEmailFallback(userId: string, deferrals = 0, delayMs?: number): Promise<void> {
  const data: EmailFallbackJobData = { userId, deferrals };
  const delay = delayMs ?? env.notificationQueue.emailFallbackDelayMinutes * 60_000;
  await withTimeout(
    getNotificationQueue().add('email-fallback', data, {
      delay,
      jobId: emailFallbackJobId(userId, deferrals),
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
    }),
    ENQUEUE_TIMEOUT_MS,
    'scheduleEmailFallback',
  );
}

async function dispatch(job: Job<NotificationJobData>): Promise<void> {
  switch (job.name) {
    case 'fanout':
      return processFanout(job as Job<FanoutJobData>);
    case 'web':
      return processWeb(job as Job<WebJobData>);
    case 'fcm':
      return processFcm(job as Job<FcmJobData>);
    case 'email-fallback':
      return processEmailFallback(job as Job<EmailFallbackJobData>);
    default:
      logger.warn('Notification worker: unknown job name, dropping', { name: job.name, id: job.id });
  }
}

export function startNotificationWorker(): void {
  if (!env.notificationQueue.enabled || !env.notificationQueue.workerEnabled) return;
  if (worker) return;

  workerConn = createBullMqConnection('worker');
  worker = new Worker<NotificationJobData>(NOTIFICATION_QUEUE_NAME, dispatch, {
    connection: workerConn,
    concurrency: env.notificationQueue.concurrency,
  });

  worker.on('error', (err) => logger.error('Notification worker error', { err: err.message }));
  worker.on('failed', (job, err) => {
    if (!job) return;
    const attempts = job.opts.attempts ?? 1;
    const final = job.attemptsMade >= attempts;
    logger.warn('Notification job failed', {
      id: job.id,
      name: job.name,
      attemptsMade: job.attemptsMade,
      final,
      err: err.message,
    });
    // Out of retries: keep a durable breadcrumb (no credentials — ids only).
    if (final) {
      const d = job.data as Partial<WebJobData & FcmJobData>;
      void recordFailedTask(
        'NOTIFICATION_DELIVERY',
        {
          job: job.name,
          userId: d.userId,
          subscriptionId: d.subscriptionId,
          tokenId: d.tokenId,
          tag: (job.data as { payload?: PushPayload }).payload?.tag,
        },
        err,
      );
    }
  });
  logger.info('Notification worker started', { concurrency: env.notificationQueue.concurrency });
}

/** Graceful stop: lets in-flight jobs finish (bounded by server.ts's forced-exit timer). */
export async function stopNotificationQueue(): Promise<void> {
  try {
    await worker?.close();
    await queue?.close();
    await Promise.allSettled([workerConn?.quit(), producerConn?.quit()]);
  } catch (err) {
    logger.warn('Notification queue shutdown error', { err });
  } finally {
    worker = null;
    queue = null;
    workerConn = null;
    producerConn = null;
  }
}
