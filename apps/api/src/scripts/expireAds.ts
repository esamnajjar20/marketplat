/**
 * Bounded daily ad lifecycle sweep. Go performs warning/expiry state changes
 * and creates in-app notifications plus durable push-dispatch rows atomically.
 * Express retains cache/Cloudflare invalidation and post-commit live fan-out.
 */
import { prisma as sharedPrisma } from '../config/prisma';
import { redis, cacheRedis } from '../config/redis';
import { logger } from '../shared/utils/logger';
import { bumpAdsCacheVersionAndHome } from '../modules/ads/ads.cache.keys';
import { flushEdgePurge } from '../shared/cache/edgePurge';
import { executeWithGoFallback, runAdvisoryLockedBatch } from '../shared/go-worker/executeWithFallback';
import { publishDurableNotifications } from '../shared/go-worker/publishDurableNotifications';
import { shutdownNotificationStream } from '../shared/utils/notificationStream';

const prisma = sharedPrisma;
const BATCH_SIZE = 500;
const MAX_BATCHES = 20;
const WARNING_WINDOW_DAYS = 7;
// Must match adExpiryLockID in apps/go-worker/cmd/server/main.go.
const AD_EXPIRY_LOCK_ID = 731904299n;

interface AdExpiryResult {
  warned: number;
  expired: number;
  notified: number;
  warningBatches: number;
  expiryBatches: number;
  warningLimitReached: boolean;
  expiryLimitReached: boolean;
  evaluatedAt: string;
  warningCutoff: string;
  notificationIds: string[];
}

function isAdExpiryResult(value: unknown): value is AdExpiryResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(result.warned) && (result.warned as number) >= 0 &&
    Number.isSafeInteger(result.expired) && (result.expired as number) >= 0 &&
    Number.isSafeInteger(result.notified) && (result.notified as number) >= 0 &&
    Number.isSafeInteger(result.warningBatches) && (result.warningBatches as number) >= 0 &&
    Number.isSafeInteger(result.expiryBatches) && (result.expiryBatches as number) >= 0 &&
    typeof result.warningLimitReached === 'boolean' &&
    typeof result.expiryLimitReached === 'boolean' &&
    typeof result.evaluatedAt === 'string' && Number.isFinite(Date.parse(result.evaluatedAt)) &&
    typeof result.warningCutoff === 'string' && Number.isFinite(Date.parse(result.warningCutoff)) &&
    Array.isArray(result.notificationIds) &&
    result.notificationIds.every(id => typeof id === 'string' && id.length > 0) &&
    result.notified === result.notificationIds.length
  );
}

async function refreshAdsCaches(): Promise<void> {
  try {
    await bumpAdsCacheVersionAndHome({ kind: 'hide' });
    await flushEdgePurge();
  } catch (error) {
    // The DB state is committed; never rerun it just because a cache edge failed.
    logger.error('[expire-ads] cache invalidation failed after DB update', { error });
  }
}

async function publishNotifications(notificationIds: string[]): Promise<void> {
  await publishDurableNotifications(prisma, notificationIds, '[expire-ads]');
}

async function runExpressFallback(): Promise<'completed' | 'busy'> {
  const now = new Date();
  const warningCutoff = new Date(now.getTime() + WARNING_WINDOW_DAYS * 24 * 60 * 60 * 1_000);
  let warned = 0;
  let expired = 0;
  let warningBatches = 0;
  let expiryBatches = 0;
  let warningLimitReached = false;
  let expiryLimitReached = false;
  const notificationIds: string[] = [];

  for (let batchIndex = 0; batchIndex < MAX_BATCHES; batchIndex += 1) {
    const batch = await runAdvisoryLockedBatch(prisma, AD_EXPIRY_LOCK_ID, async tx => tx.$queryRaw<Array<{ adId: string; notificationId: string | null }>>`
      WITH due AS (
        SELECT ad."id", ad."userId", ad."title", ad."expiresAt"
        FROM "ads" AS ad
        WHERE ad."status" = 'ACTIVE'
          AND ad."flaggedForReview" = FALSE
          AND ad."expiresAt" > ${now}
          AND ad."expiresAt" <= ${warningCutoff}
          AND ad."expirationNotifiedAt" IS NULL
        ORDER BY ad."expiresAt" ASC, ad."id" ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE OF ad SKIP LOCKED
      ), warned AS (
        UPDATE "ads" AS ad
        SET "expirationNotifiedAt" = ${now}, "updatedAt" = ${now}
        FROM due
        WHERE ad."id" = due."id"
          AND ad."status" = 'ACTIVE'
          AND ad."expirationNotifiedAt" IS NULL
        RETURNING ad."id", ad."userId", due."title", due."expiresAt"
      ), inserted AS (
        INSERT INTO "notifications"
          ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
        SELECT
          'go_' || md5(random()::text || clock_timestamp()::text || w."id"),
          'ad-expiring-soon:' || w."id",
          w."userId",
          'AD_EXPIRING_SOON',
          'إعلانك يقترب من الانتهاء',
          LEFT('سينتهي إعلان "' || w."title" || '" خلال 7 أيام تقريبًا', 500),
          jsonb_build_object(
            'adId', w."id",
            'expiresAt', to_char(w."expiresAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'event', 'expiring'
          ),
          NOW()
        FROM warned w
        ON CONFLICT ("idempotencyKey") DO NOTHING
        RETURNING "id", "userId", "type", "title", "body", "data"
      ), dispatch AS (
        INSERT INTO "notification_push_dispatches"
          ("id", "notificationId", "userId", "payload", "idempotencyKey")
        SELECT
          'go_' || md5(random()::text || clock_timestamp()::text || n."id"),
          n."id", n."userId",
          jsonb_build_object(
            'title', n."title", 'body', n."body",
            'url', '/ads/' || (n."data" ->> 'adId'),
            'tag', 'ad-expiry-' || (n."data" ->> 'adId'),
            'type', n."type"::text
          ),
          'notification-push:' || n."id"
        FROM inserted n
        ON CONFLICT ("idempotencyKey") DO NOTHING
        RETURNING "id"
      )
      SELECT w."id" AS "adId", inserted."id" AS "notificationId"
      FROM warned w
      LEFT JOIN inserted ON inserted."data" ->> 'adId' = w."id"
      ORDER BY w."id" ASC
    `, { transactionTimeoutMs: 20_000 });

    if (!batch.acquired) {
      await publishNotifications(notificationIds);
      if (expired > 0) await refreshAdsCaches();
      logger.info('[expire-ads] warning sweep stopped because another runner owns the advisory lock', { warned, expired });
      return 'busy';
    }

    warned += batch.value.length;
    warningBatches += batch.value.length > 0 ? 1 : 0;
    notificationIds.push(...batch.value.flatMap(row => row.notificationId ? [row.notificationId] : []));
    if (batch.value.length < BATCH_SIZE) break;
    if (batchIndex === MAX_BATCHES - 1) warningLimitReached = true;
  }

  for (let batchIndex = 0; batchIndex < MAX_BATCHES; batchIndex += 1) {
    const batch = await runAdvisoryLockedBatch(prisma, AD_EXPIRY_LOCK_ID, async tx => tx.$queryRaw<Array<{ adId: string; notificationId: string | null }>>`
      WITH due AS (
        SELECT ad."id", ad."userId", ad."title"
        FROM "ads" AS ad
        WHERE ad."status" = 'ACTIVE'
          AND ad."expiresAt" IS NOT NULL
          AND ad."expiresAt" <= ${now}
        ORDER BY ad."expiresAt" ASC, ad."id" ASC
        LIMIT ${BATCH_SIZE}
        FOR UPDATE OF ad SKIP LOCKED
      ), expired AS (
        UPDATE "ads" AS ad
        SET "status" = 'EXPIRED', "updatedAt" = ${now}
        FROM due
        WHERE ad."id" = due."id"
          AND ad."status" = 'ACTIVE'
          AND ad."expiresAt" <= ${now}
        RETURNING ad."id", ad."userId", due."title"
      ), inserted AS (
        INSERT INTO "notifications"
          ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
        SELECT
          'go_' || md5(random()::text || clock_timestamp()::text || e."id"),
          'ad-expired:' || e."id",
          e."userId",
          'AD_EXPIRED',
          'انتهى إعلانك',
          LEFT('انتهت مدة نشر "' || e."title" || '". يمكنك تجديده من إعلاناتك.', 500),
          jsonb_build_object('adId', e."id", 'event', 'expired'),
          NOW()
        FROM expired e
        ON CONFLICT ("idempotencyKey") DO NOTHING
        RETURNING "id", "userId", "type", "title", "body", "data"
      ), dispatch AS (
        INSERT INTO "notification_push_dispatches"
          ("id", "notificationId", "userId", "payload", "idempotencyKey")
        SELECT
          'go_' || md5(random()::text || clock_timestamp()::text || n."id"),
          n."id", n."userId",
          jsonb_build_object(
            'title', n."title", 'body', n."body",
            'url', '/ads/' || (n."data" ->> 'adId'),
            'tag', 'ad-expired-' || (n."data" ->> 'adId'),
            'type', n."type"::text
          ),
          'notification-push:' || n."id"
        FROM inserted n
        ON CONFLICT ("idempotencyKey") DO NOTHING
        RETURNING "id"
      )
      SELECT e."id" AS "adId", inserted."id" AS "notificationId"
      FROM expired e
      LEFT JOIN inserted ON inserted."data" ->> 'adId' = e."id"
      ORDER BY e."id" ASC
    `, { transactionTimeoutMs: 20_000 });

    if (!batch.acquired) {
      await publishNotifications(notificationIds);
      if (expired > 0) await refreshAdsCaches();
      logger.info('[expire-ads] expiry sweep stopped because another runner owns the advisory lock', { warned, expired });
      return 'busy';
    }

    expired += batch.value.length;
    expiryBatches += batch.value.length > 0 ? 1 : 0;
    notificationIds.push(...batch.value.flatMap(row => row.notificationId ? [row.notificationId] : []));
    if (batch.value.length < BATCH_SIZE) break;
    if (batchIndex === MAX_BATCHES - 1) expiryLimitReached = true;
  }

  await publishNotifications(notificationIds);
  if (expired > 0) await refreshAdsCaches();
  logger.info('[expire-ads] Go fallback completed', {
    warned, expired, notified: notificationIds.length,
    warningBatches, expiryBatches, warningLimitReached, expiryLimitReached,
    evaluatedAt: now.toISOString(), warningCutoff: warningCutoff.toISOString(),
  });
  return 'completed';
}

async function main(): Promise<void> {
  await executeWithGoFallback<AdExpiryResult>({
    jobName: 'expire-ads',
    path: '/internal/jobs/expire-ads',
    body: {},
    validateResult: isAdExpiryResult,
    onGoSuccess: async result => {
      await publishNotifications(result.notificationIds);
      if (result.expired > 0) await refreshAdsCaches();
      if (result.warningLimitReached || result.expiryLimitReached) {
        logger.warn('[expire-ads] reached a per-sweep batch ceiling; remaining ads will be picked up by the next run', result);
      }
    },
    runExpressFallback,
  });
}

main()
  .catch(error => {
    logger.error('[expire-ads] job failed:', { error });
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
