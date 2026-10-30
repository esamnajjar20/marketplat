/**
 * Go-first promotion lifecycle sweep. State transitions, owner/follower in-app
 * notifications, and durable push dispatches are one SQL statement per batch.
 * Express fallback shares the exact advisory lock and SQL semantics.
 */
import { prisma } from '../config/prisma';
import { redis, cacheRedis } from '../config/redis';
import { logger } from '../shared/utils/logger';
import { executeWithGoFallback, runAdvisoryLockedBatch } from '../shared/go-worker/executeWithFallback';
import { publishDurableNotifications } from '../shared/go-worker/publishDurableNotifications';
import { shutdownNotificationStream } from '../shared/utils/notificationStream';

const BATCH_SIZE = 100;
const MAX_BATCHES = 50;
const PROMOTION_LIFECYCLE_LOCK_ID = 731904301n;
const WARNING_WINDOW_HOURS = 24;

interface PromotionLifecycleResult {
  started: number;
  expiring: number;
  expired: number;
  notified: number;
  startedBatches: number;
  expiringBatches: number;
  expiredBatches: number;
  limitReached: boolean;
  evaluatedAt: string;
  warningCutoff: string;
  notificationIds: string[];
}

interface PromotionBatchRow { promotionId: string; notificationId: string | null }

function isResult(value: unknown): value is PromotionLifecycleResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  const counts = ['started', 'expiring', 'expired', 'notified', 'startedBatches', 'expiringBatches', 'expiredBatches'];
  return counts.every(key => Number.isSafeInteger(result[key]) && (result[key] as number) >= 0) &&
    typeof result.limitReached === 'boolean' &&
    typeof result.evaluatedAt === 'string' && Number.isFinite(Date.parse(result.evaluatedAt)) &&
    typeof result.warningCutoff === 'string' && Number.isFinite(Date.parse(result.warningCutoff)) &&
    Array.isArray(result.notificationIds) && result.notificationIds.every(id => typeof id === 'string' && id.length > 0) &&
    result.notified === result.notificationIds.length;
}

const STARTED_BATCH_SQL = String.raw`
WITH due AS (
    SELECT p."id", p."storeId", p."productId", p."title", product."name" AS "productName"
    FROM "promotions" p
    INNER JOIN "products" product ON product."id" = p."productId"
    WHERE p."status" = 'SCHEDULED'
      AND p."startsAt" <= $1
    ORDER BY p."startsAt" ASC, p."id" ASC
    LIMIT $2
    FOR UPDATE OF p SKIP LOCKED
), started AS (
    UPDATE "promotions" p
    SET "status" = 'ACTIVE', "updatedAt" = $1
    FROM due
    WHERE p."id" = due."id"
      AND p."status" = 'SCHEDULED'
      AND p."startsAt" <= $1
    RETURNING p."id", p."storeId", p."productId", p."title", due."productName"
), owner_recipients AS (
    SELECT
        s."id" AS "promotionId", s."storeId", s."productId", u."id" AS "userId",
        'PROMOTION_STATUS_CHANGE'::text AS "notificationType",
        'بدأ عرضك'::text AS "notificationTitle",
        LEFT('بدأ العرض "' || s."title" || '" على "' || s."productName" || '"', 500) AS "notificationBody",
        jsonb_build_object('promotionId', s."id", 'productId', s."productId", 'event', 'started') AS "notificationData",
        '/my-store?tab=promotions'::text AS "pushUrl",
        'promotion-' || s."id" || '-started' AS "pushTag",
        'promotion-started-owner:' || s."id" AS "idempotencyKey"
    FROM started s
    INNER JOIN "store_details" sd ON sd."id" = s."storeId"
    INNER JOIN "seller_profiles" sp ON sp."id" = sd."sellerProfileId"
    INNER JOIN "users" u ON u."id" = sp."userId"
    WHERE u."notificationPreferences" ->> 'myPromotions' = 'true'
), follower_recipients AS (
    SELECT
        s."id" AS "promotionId", s."storeId", s."productId", u."id" AS "userId",
        'STORE_PROMOTION_STARTED'::text AS "notificationType",
        'عرض جديد'::text AS "notificationTitle",
        LEFT('عرض جديد على "' || s."productName" || '": ' || s."title", 500) AS "notificationBody",
        jsonb_build_object('storeId', s."storeId", 'promotionId', s."id", 'productId', s."productId") AS "notificationData",
        '/stores/' || s."storeId" AS "pushUrl",
        'store-promotion-' || s."id" AS "pushTag",
        'store-promotion-started:' || s."id" || ':' || u."id" AS "idempotencyKey"
    FROM started s
    INNER JOIN "store_followers" sf ON sf."storeId" = s."storeId"
    INNER JOIN "users" u ON u."id" = sf."userId"

), recipients AS (
    SELECT * FROM owner_recipients
    UNION ALL
    SELECT * FROM follower_recipients
), inserted AS (
    INSERT INTO "notifications"
        ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || r."idempotencyKey"),
        r."idempotencyKey", r."userId", r."notificationType"::"NotificationType",
        r."notificationTitle", r."notificationBody", r."notificationData", NOW()
    FROM recipients r
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id", "idempotencyKey", "userId", "type", "title", "body", "data"
), dispatch AS (
    INSERT INTO "notification_push_dispatches"
        ("id", "notificationId", "userId", "payload", "idempotencyKey")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || n."id"),
        n."id", n."userId",
        jsonb_build_object(
            'title', n."title", 'body', n."body",
            'url', r."pushUrl", 'tag', r."pushTag", 'type', n."type"::text
        ),
        'notification-push:' || n."id"
    FROM inserted n
    INNER JOIN recipients r ON r."idempotencyKey" = n."idempotencyKey"
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id"
)
SELECT s."id" AS "promotionId", inserted."id" AS "notificationId"
FROM started s
LEFT JOIN inserted ON inserted."idempotencyKey" = 'promotion-started-owner:' || s."id"
    OR (split_part(inserted."idempotencyKey", ':', 1) = 'store-promotion-started'
        AND split_part(inserted."idempotencyKey", ':', 2) = s."id")
ORDER BY s."id" ASC, inserted."id" ASC
`;
const EXPIRING_BATCH_SQL = String.raw`
WITH due AS (
    SELECT p."id", p."storeId", p."productId", p."title", product."name" AS "productName"
    FROM "promotions" p
    INNER JOIN "products" product ON product."id" = p."productId"
    WHERE p."status" = 'ACTIVE'
      AND p."endsAt" > $1
      AND p."endsAt" <= $2
      AND p."expiryWarnedAt" IS NULL
    ORDER BY p."endsAt" ASC, p."id" ASC
    LIMIT $3
    FOR UPDATE OF p SKIP LOCKED
), warned AS (
    UPDATE "promotions" p
    SET "expiryWarnedAt" = $1, "updatedAt" = $1
    FROM due
    WHERE p."id" = due."id"
      AND p."status" = 'ACTIVE'
      AND p."expiryWarnedAt" IS NULL
    RETURNING p."id", p."storeId", p."productId", p."title", due."productName"
), recipients AS (
    SELECT
        w."id" AS "promotionId", w."storeId", w."productId", u."id" AS "userId",
        'PROMOTION_STATUS_CHANGE'::"NotificationType" AS "notificationType",
        'عرضك سينتهي قريباً'::text AS "notificationTitle",
        LEFT('سينتهي العرض "' || w."title" || '" على "' || w."productName" || '" خلال 24 ساعة', 500) AS "notificationBody",
        jsonb_build_object('promotionId', w."id", 'productId', w."productId", 'event', 'expiring') AS "notificationData",
        '/my-store?tab=promotions'::text AS "pushUrl",
        'promotion-' || w."id" || '-expiring' AS "pushTag",
        'promotion-expiring-owner:' || w."id" AS "idempotencyKey"
    FROM warned w
    INNER JOIN "store_details" sd ON sd."id" = w."storeId"
    INNER JOIN "seller_profiles" sp ON sp."id" = sd."sellerProfileId"
    INNER JOIN "users" u ON u."id" = sp."userId"
    WHERE u."notificationPreferences" ->> 'myPromotions' = 'true'
), inserted AS (
    INSERT INTO "notifications"
        ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || r."idempotencyKey"),
        r."idempotencyKey", r."userId", r."notificationType",
        r."notificationTitle", r."notificationBody", r."notificationData", NOW()
    FROM recipients r
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id", "idempotencyKey", "userId", "type", "title", "body", "data"
), dispatch AS (
    INSERT INTO "notification_push_dispatches"
        ("id", "notificationId", "userId", "payload", "idempotencyKey")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || n."id"),
        n."id", n."userId",
        jsonb_build_object(
            'title', n."title", 'body', n."body",
            'url', '/my-store?tab=promotions', 'tag', 'promotion-' || (n."data" ->> 'promotionId') || '-expiring',
            'type', n."type"::text
        ),
        'notification-push:' || n."id"
    FROM inserted n
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id"
)
SELECT w."id" AS "promotionId", inserted."id" AS "notificationId"
FROM warned w
LEFT JOIN inserted ON inserted."idempotencyKey" = 'promotion-expiring-owner:' || w."id"
ORDER BY w."id" ASC
`;
const EXPIRED_BATCH_SQL = String.raw`
WITH due AS (
    SELECT p."id", p."storeId", p."productId", p."title", product."name" AS "productName"
    FROM "promotions" p
    INNER JOIN "products" product ON product."id" = p."productId"
    WHERE p."status" = 'ACTIVE'
      AND p."endsAt" <= $1
    ORDER BY p."endsAt" ASC, p."id" ASC
    LIMIT $2
    FOR UPDATE OF p SKIP LOCKED
), expired AS (
    UPDATE "promotions" p
    SET "status" = 'EXPIRED', "updatedAt" = $1
    FROM due
    WHERE p."id" = due."id"
      AND p."status" = 'ACTIVE'
      AND p."endsAt" <= $1
    RETURNING p."id", p."storeId", p."productId", p."title", due."productName"
), recipients AS (
    SELECT
        e."id" AS "promotionId", e."storeId", e."productId", u."id" AS "userId",
        'PROMOTION_STATUS_CHANGE'::"NotificationType" AS "notificationType",
        'انتهى عرضك'::text AS "notificationTitle",
        LEFT('انتهى العرض "' || e."title" || '" على "' || e."productName" || '"', 500) AS "notificationBody",
        jsonb_build_object('promotionId', e."id", 'productId', e."productId", 'event', 'expired') AS "notificationData",
        '/my-store?tab=promotions'::text AS "pushUrl",
        'promotion-' || e."id" || '-expired' AS "pushTag",
        'promotion-expired-owner:' || e."id" AS "idempotencyKey"
    FROM expired e
    INNER JOIN "store_details" sd ON sd."id" = e."storeId"
    INNER JOIN "seller_profiles" sp ON sp."id" = sd."sellerProfileId"
    INNER JOIN "users" u ON u."id" = sp."userId"
    WHERE u."notificationPreferences" ->> 'myPromotions' = 'true'
), inserted AS (
    INSERT INTO "notifications"
        ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || r."idempotencyKey"),
        r."idempotencyKey", r."userId", r."notificationType",
        r."notificationTitle", r."notificationBody", r."notificationData", NOW()
    FROM recipients r
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id", "idempotencyKey", "userId", "type", "title", "body", "data"
), dispatch AS (
    INSERT INTO "notification_push_dispatches"
        ("id", "notificationId", "userId", "payload", "idempotencyKey")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || n."id"),
        n."id", n."userId",
        jsonb_build_object(
            'title', n."title", 'body', n."body",
            'url', '/my-store?tab=promotions', 'tag', 'promotion-' || (n."data" ->> 'promotionId') || '-expired',
            'type', n."type"::text
        ),
        'notification-push:' || n."id"
    FROM inserted n
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id"
)
SELECT e."id" AS "promotionId", inserted."id" AS "notificationId"
FROM expired e
LEFT JOIN inserted ON inserted."idempotencyKey" = 'promotion-expired-owner:' || e."id"
ORDER BY e."id" ASC
`;

async function publishNotifications(notificationIds: string[]): Promise<void> {
  await publishDurableNotifications(prisma, notificationIds, '[promotion-lifecycle]');
}

async function runFallbackPhase(
  phase: 'started' | 'expiring' | 'expired',
  query: string,
  args: unknown[],
  notificationIds: string[],
): Promise<{ processed: number; batches: number; limitReached: boolean; busy: boolean }> {
  const processedPromotions = new Set<string>();
  let batches = 0;
  let limitReached = false;

  for (let batchIndex = 0; batchIndex < MAX_BATCHES; batchIndex += 1) {
    const batch = await runAdvisoryLockedBatch(
      prisma,
      PROMOTION_LIFECYCLE_LOCK_ID,
      tx => tx.$queryRawUnsafe<PromotionBatchRow[]>(query, ...args),
      { transactionTimeoutMs: 30_000 },
    );
    if (!batch.acquired) {
      logger.info(`[promotion-lifecycle] Express fallback stopped; another runner owns the lock`, { phase, processed: processedPromotions.size });
      return { processed: processedPromotions.size, batches, limitReached, busy: true };
    }

    for (const row of batch.value) {
      processedPromotions.add(row.promotionId);
      if (row.notificationId) notificationIds.push(row.notificationId);
    }
    if (batch.value.length === 0) break;
    batches += 1;
    const currentBatchPromotions = new Set(batch.value.map(row => row.promotionId)).size;
    if (currentBatchPromotions < BATCH_SIZE) break;
    if (batchIndex === MAX_BATCHES - 1) limitReached = true;
  }
  return { processed: processedPromotions.size, batches, limitReached, busy: false };
}

async function runExpressFallback(): Promise<'completed' | 'busy'> {
  const now = new Date();
  const warningCutoff = new Date(now.getTime() + WARNING_WINDOW_HOURS * 60 * 60 * 1_000);
  const notificationIds: string[] = [];

  const started = await runFallbackPhase('started', STARTED_BATCH_SQL, [now, BATCH_SIZE], notificationIds);
  if (started.busy) {
    await publishNotifications(notificationIds);
    return 'busy';
  }
  const expiring = await runFallbackPhase('expiring', EXPIRING_BATCH_SQL, [now, warningCutoff, BATCH_SIZE], notificationIds);
  if (expiring.busy) {
    await publishNotifications(notificationIds);
    return 'busy';
  }
  const expired = await runFallbackPhase('expired', EXPIRED_BATCH_SQL, [now, BATCH_SIZE], notificationIds);
  await publishNotifications(notificationIds);
  if (expired.busy) return 'busy';

  const limitReached = started.limitReached || expiring.limitReached || expired.limitReached;
  logger.info('[promotion-lifecycle] Express fallback completed', {
    started: started.processed, expiring: expiring.processed, expired: expired.processed,
    notified: notificationIds.length, startedBatches: started.batches,
    expiringBatches: expiring.batches, expiredBatches: expired.batches,
    limitReached, evaluatedAt: now.toISOString(), warningCutoff: warningCutoff.toISOString(),
  });
  return 'completed';
}

async function main(): Promise<void> {
  await executeWithGoFallback<PromotionLifecycleResult>({
    jobName: 'promotion-lifecycle',
    path: '/internal/jobs/promotion-lifecycle',
    body: {},
    validateResult: isResult,
    runExpressFallback,
    onGoSuccess: async result => {
      await publishNotifications(result.notificationIds);
      if (result.limitReached) {
        logger.warn('[promotion-lifecycle] reached a per-phase batch ceiling; remaining promotions will be picked up by the next 15-minute run', result);
      }
    },
  });
}

main()
  .catch(error => {
    logger.error('[promotion-lifecycle] job failed', { error });
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
