/**
 * Closes PENDING service requests older than the shared 7-day TTL.
 * Go performs the status transition and the in-app notification + durable
 * push-dispatch insert atomically. Express remains the safe SQL fallback and
 * owns post-commit unread-cache, SSE, and email-fallback side effects.
 */
import { prisma as sharedPrisma } from '../config/prisma';
import { SERVICE_REQUEST_PENDING_TTL_DAYS } from '../modules/service-requests/service-requests.service';
import { logger } from '../shared/utils/logger';
import {
  executeWithGoFallback,
  runAdvisoryLockedBatch,
} from '../shared/go-worker/executeWithFallback';
import { redis, cacheRedis } from '../config/redis';
import { shutdownNotificationStream } from '../shared/utils/notificationStream';
import { publishDurableNotifications } from '../shared/go-worker/publishDurableNotifications';

const prisma = sharedPrisma;
const BATCH_SIZE = 200;
const MAX_BATCHES = 50; // Same 10,000-row per-run ceiling as the previous Express job.
// Must match serviceRequestExpiryLockID in apps/go-worker/cmd/server/main.go.
const SERVICE_REQUEST_EXPIRY_LOCK_ID = 731904298n;

interface ServiceExpiryResult {
  expired: number;
  notified: number;
  batches: number;
  ttlDays: number;
  cutoff: string;
  evaluatedAt: string;
  limitReached: boolean;
  notificationIds: string[];
}

function isServiceExpiryResult(value: unknown): value is ServiceExpiryResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(result.expired) && (result.expired as number) >= 0 &&
    Number.isSafeInteger(result.notified) && (result.notified as number) >= 0 &&
    Number.isSafeInteger(result.batches) && (result.batches as number) >= 0 &&
    result.ttlDays === SERVICE_REQUEST_PENDING_TTL_DAYS &&
    typeof result.cutoff === 'string' && Number.isFinite(Date.parse(result.cutoff)) &&
    typeof result.evaluatedAt === 'string' && Number.isFinite(Date.parse(result.evaluatedAt)) &&
    typeof result.limitReached === 'boolean' &&
    Array.isArray(result.notificationIds) &&
    result.notificationIds.every(id => typeof id === 'string' && id.length > 0) &&
    result.notified === result.notificationIds.length
  );
}

async function publishCreatedNotifications(notificationIds: string[]): Promise<void> {
  await publishDurableNotifications(prisma, notificationIds, '[expire-service-requests]');
}

async function runExpressFallback(): Promise<'completed' | 'busy'> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - SERVICE_REQUEST_PENDING_TTL_DAYS * 24 * 60 * 60 * 1_000);
  let expired = 0;
  let batches = 0;
  let limitReached = false;
  const notificationIds: string[] = [];

  for (let batchIndex = 0; batchIndex < MAX_BATCHES; batchIndex += 1) {
    const batch = await runAdvisoryLockedBatch(prisma, SERVICE_REQUEST_EXPIRY_LOCK_ID, async tx => {
      const rows = await tx.$queryRaw<Array<{ requestId: string; notificationId: string | null }>>`
        WITH due AS (
          SELECT sr."id", sr."customerId", listing."title" AS "listingTitle"
          FROM "service_requests" AS sr
          INNER JOIN "service_listings" AS listing ON listing."id" = sr."listingId"
          WHERE sr."status" = 'PENDING'
            AND sr."createdAt" < ${cutoff}
          ORDER BY sr."createdAt" ASC, sr."id" ASC
          LIMIT ${BATCH_SIZE}
          FOR UPDATE OF sr SKIP LOCKED
        ), expired AS (
          UPDATE "service_requests" AS request
          SET "status" = 'EXPIRED', "updatedAt" = ${now}
          FROM due
          WHERE request."id" = due."id"
            AND request."status" = 'PENDING'
            AND request."createdAt" < ${cutoff}
          RETURNING request."id", request."customerId", due."listingTitle"
        ), eligible AS (
          SELECT e.*
          FROM expired e
          INNER JOIN "users" u ON u."id" = e."customerId"
          WHERE CASE jsonb_typeof(u."notificationPreferences" -> 'serviceQuotes')
            WHEN 'boolean' THEN COALESCE((u."notificationPreferences" ->> 'serviceQuotes')::boolean, TRUE)
            WHEN 'null' THEN FALSE
            WHEN 'number' THEN COALESCE((u."notificationPreferences" ->> 'serviceQuotes')::numeric <> 0, FALSE)
            WHEN 'string' THEN COALESCE((u."notificationPreferences" ->> 'serviceQuotes') <> '', FALSE)
            ELSE TRUE
          END
        ), inserted AS (
          INSERT INTO "notifications"
            ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
          SELECT
            'go_' || md5(random()::text || clock_timestamp()::text || e."id"),
            'service-request-expired:' || e."id",
            e."customerId",
            'SERVICE_REQUEST_UPDATE',
            'انتهت مهلة طلبك',
            LEFT('لم يردّ مقدم الخدمة على طلبك "' || e."listingTitle" || '" خلال ' || ${SERVICE_REQUEST_PENDING_TTL_DAYS}::text ||
              ' أيام فتم إغلاقه — يمكنك تقديم طلب جديد أو اختيار مقدم خدمة آخر', 500),
            jsonb_build_object('requestId', e."id", 'status', 'EXPIRED'),
            NOW()
          FROM eligible e
          ON CONFLICT ("idempotencyKey") DO NOTHING
          RETURNING "id", "userId", "type", "title", "body", "data"
        ), dispatch AS (
          INSERT INTO "notification_push_dispatches"
            ("id", "notificationId", "userId", "payload", "idempotencyKey")
          SELECT
            'go_' || md5(random()::text || clock_timestamp()::text || n."id"),
            n."id",
            n."userId",
            jsonb_build_object(
              'title', n."title",
              'body', n."body",
              'url', '/service-requests/' || (n."data" ->> 'requestId'),
              'tag', 'service-request-' || (n."data" ->> 'requestId'),
              'type', n."type"::text
            ),
            'notification-push:' || n."id"
          FROM inserted n
          ON CONFLICT ("idempotencyKey") DO NOTHING
          RETURNING "id"
        )
        SELECT e."id" AS "requestId", inserted."id" AS "notificationId"
        FROM expired e
        LEFT JOIN inserted ON inserted."data" ->> 'requestId' = e."id"
        ORDER BY e."id" ASC
      `;
      return rows;
    }, { transactionTimeoutMs: 20_000 });

    if (!batch.acquired) {
      await publishCreatedNotifications(notificationIds);
      logger.info('[expire-service-requests] Express fallback stopped because another runner owns the advisory lock', {
        expired,
        batches,
      });
      return 'busy';
    }

    expired += batch.value.length;
    notificationIds.push(
      ...batch.value.flatMap(row => row.notificationId ? [row.notificationId] : [])
    );
    if (batch.value.length > 0) batches += 1;
    if (batch.value.length < BATCH_SIZE) break;
    if (batchIndex === MAX_BATCHES - 1) limitReached = true;
  }

  await publishCreatedNotifications(notificationIds);
  logger.info('[expire-service-requests] Express fallback completed', {
    expired,
    notified: notificationIds.length,
    batches,
    ttlDays: SERVICE_REQUEST_PENDING_TTL_DAYS,
    cutoff: cutoff.toISOString(),
    evaluatedAt: now.toISOString(),
    limitReached,
  });
  return 'completed';
}

async function main(): Promise<void> {
  await executeWithGoFallback<ServiceExpiryResult>({
    jobName: 'expire-service-requests',
    path: '/internal/jobs/expire-service-requests',
    body: {},
    validateResult: isServiceExpiryResult,
    onGoSuccess: async result => {
      await publishCreatedNotifications(result.notificationIds);
      if (result.limitReached) {
        logger.warn('[expire-service-requests] reached the per-run 10,000-row cap; remaining rows will be picked up by the next run', result);
      }
    },
    runExpressFallback,
  });
}

main()
  .catch(error => {
    logger.error('[expire-service-requests] job failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([
      prisma.$disconnect(),
      shutdownNotificationStream(),
      redis.quit(),
      ...(cacheRedis !== redis ? [cacheRedis.quit()] : []),
    ]);
  });
