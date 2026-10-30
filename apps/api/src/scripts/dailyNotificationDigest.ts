/**
 * Consolidates unread low-priority notifications into one summary per user.
 * Go performs the same keyset-paginated SQL batch when configured; Express is
 * the automatic fallback. Critical notification types are never included.
 */
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import {
  executeWithGoFallback,
  runAdvisoryLockedBatch,
} from '../shared/go-worker/executeWithFallback';

const prisma = new PrismaClient();
const BATCH_SIZE = 100;
// Must match notificationDigestLockID in apps/go-worker/cmd/server/main.go.
const NOTIFICATION_DIGEST_LOCK_ID = 731904285n;

type DigestBatchResult = {
  lastUserId: string | null;
  digestsCreated: bigint | number;
  rowsMarkedRead: bigint | number;
};

type NotificationDigestResult = {
  digestsCreated: number;
  rowsMarkedRead: number;
  batches: number;
};

function isNotificationDigestResult(value: unknown): value is NotificationDigestResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(result.digestsCreated) && (result.digestsCreated as number) >= 0 &&
    Number.isSafeInteger(result.rowsMarkedRead) && (result.rowsMarkedRead as number) >= 0 &&
    Number.isSafeInteger(result.batches) && (result.batches as number) >= 0
  );
}

/**
 * This SQL is intentionally equivalent to Go's
 * internal/notificationdigest/digest.go. Aggregation, digest insertion, and
 * marking source rows read are performed database-side in one atomic statement.
 */
async function processDigestBatch(
  tx: Prisma.TransactionClient,
  lastUserId: string,
  now: Date
): Promise<DigestBatchResult> {
  const rows = await tx.$queryRaw<DigestBatchResult[]>`
    WITH candidate_users AS MATERIALIZED (
      SELECT n."userId"
      FROM "notifications" AS n
      WHERE n."readAt" IS NULL
        AND n."type" IN (
          'PROMOTION',
          'SAVED_SEARCH_MATCH',
          'STORE_NEW_PRODUCT',
          'STORE_PROMOTION_STARTED',
          'STORE_PRODUCT_RESTOCKED'
        )
        AND n."data"->'digest' IS DISTINCT FROM 'true'::jsonb
        AND (${lastUserId} = '' OR n."userId" > ${lastUserId})
      GROUP BY n."userId"
      HAVING COUNT(*) >= 2
      ORDER BY n."userId" ASC
      LIMIT ${BATCH_SIZE}
    ),
    eligible AS MATERIALIZED (
      SELECT
        n."id",
        n."userId",
        n."type"::text AS "type",
        n."createdAt",
        ROW_NUMBER() OVER (
          PARTITION BY n."userId"
          ORDER BY n."createdAt" ASC, n."id" ASC
        ) AS source_rank
      FROM "notifications" AS n
      INNER JOIN candidate_users AS cu ON cu."userId" = n."userId"
      WHERE n."readAt" IS NULL
        AND n."type" IN (
          'PROMOTION',
          'SAVED_SEARCH_MATCH',
          'STORE_NEW_PRODUCT',
          'STORE_PROMOTION_STARTED',
          'STORE_PRODUCT_RESTOCKED'
        )
        AND n."data"->'digest' IS DISTINCT FROM 'true'::jsonb
    ),
    stats AS (
      SELECT
        e."userId",
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE e."type" = 'PROMOTION')::bigint AS promotion_count,
        COUNT(*) FILTER (WHERE e."type" = 'SAVED_SEARCH_MATCH')::bigint AS saved_search_count,
        COUNT(*) FILTER (WHERE e."type" = 'STORE_NEW_PRODUCT')::bigint AS store_product_count,
        COUNT(*) FILTER (WHERE e."type" = 'STORE_PROMOTION_STARTED')::bigint AS store_promotion_count,
        COUNT(*) FILTER (WHERE e."type" = 'STORE_PRODUCT_RESTOCKED')::bigint AS store_restock_count,
        MIN(e."createdAt") FILTER (WHERE e."type" = 'PROMOTION') AS promotion_first,
        MIN(e."createdAt") FILTER (WHERE e."type" = 'SAVED_SEARCH_MATCH') AS saved_search_first,
        MIN(e."createdAt") FILTER (WHERE e."type" = 'STORE_NEW_PRODUCT') AS store_product_first,
        MIN(e."createdAt") FILTER (WHERE e."type" = 'STORE_PROMOTION_STARTED') AS store_promotion_first,
        MIN(e."createdAt") FILTER (WHERE e."type" = 'STORE_PRODUCT_RESTOCKED') AS store_restock_first,
        ARRAY_AGG(e."id" ORDER BY e."createdAt" ASC, e."id" ASC)
          FILTER (WHERE e.source_rank <= 50) AS source_ids
      FROM eligible AS e
      GROUP BY e."userId"
      HAVING COUNT(*) >= 2
    ),
    selected AS (
      SELECT *
      FROM stats
    ),
    parts AS (
      SELECT
        s."userId",
        STRING_AGG(v.label || ': ' || v.amount::text, ' · ' ORDER BY v.first_at ASC, v.type ASC) AS body_parts
      FROM selected AS s
      CROSS JOIN LATERAL (VALUES
        ('PROMOTION'::text, s.promotion_count, s.promotion_first, 'عروض وتخفيضات'::text),
        ('SAVED_SEARCH_MATCH'::text, s.saved_search_count, s.saved_search_first, 'بحث محفوظ'::text),
        ('STORE_NEW_PRODUCT'::text, s.store_product_count, s.store_product_first, 'منتجات متاجر'::text),
        ('STORE_PROMOTION_STARTED'::text, s.store_promotion_count, s.store_promotion_first, 'عروض متاجر'::text),
        ('STORE_PRODUCT_RESTOCKED'::text, s.store_restock_count, s.store_restock_first, 'عودة للمخزون'::text)
      ) AS v(type, amount, first_at, label)
      WHERE v.amount > 0
      GROUP BY s."userId"
    ),
    created AS (
      INSERT INTO "notifications" (
        "id", "userId", "type", "title", "body", "data", "createdAt"
      )
      SELECT
        gen_random_uuid()::text,
        s."userId",
        'PROMOTION',
        'ملخص إشعاراتك',
        'لديك ' || s.total::text || ' إشعاراً غير مقروء: ' || p.body_parts,
        jsonb_build_object(
          'digest', TRUE,
          'counts', jsonb_strip_nulls(jsonb_build_object(
            'PROMOTION', NULLIF(s.promotion_count, 0),
            'SAVED_SEARCH_MATCH', NULLIF(s.saved_search_count, 0),
            'STORE_NEW_PRODUCT', NULLIF(s.store_product_count, 0),
            'STORE_PROMOTION_STARTED', NULLIF(s.store_promotion_count, 0),
            'STORE_PRODUCT_RESTOCKED', NULLIF(s.store_restock_count, 0)
          )),
          'sourceIds', to_jsonb(s.source_ids)
        ),
        ${now}
      FROM selected AS s
      INNER JOIN parts AS p ON p."userId" = s."userId"
      RETURNING "userId"
    ),
    updated AS (
      UPDATE "notifications" AS n
      SET "readAt" = ${now}
      FROM eligible AS e
      INNER JOIN created AS c ON c."userId" = e."userId"
      WHERE n."id" = e."id"
      RETURNING n."id"
    )
    SELECT
      (SELECT MAX("userId") FROM selected) AS "lastUserId",
      (SELECT COUNT(*) FROM created)::bigint AS "digestsCreated",
      (SELECT COUNT(*) FROM updated)::bigint AS "rowsMarkedRead"
  `;

  if (!rows[0]) throw new Error('Notification digest query returned no status row');
  return rows[0];
}

async function runExpressFallback(): Promise<'completed' | 'busy'> {
  const now = new Date();
  let lastUserId = '';
  let digestsCreated = 0;
  let rowsMarkedRead = 0;
  let batches = 0;

  for (;;) {
    const batch = await runAdvisoryLockedBatch(prisma, NOTIFICATION_DIGEST_LOCK_ID, tx =>
      processDigestBatch(tx, lastUserId, now),
      { transactionTimeoutMs: 60_000 }
    );

    if (!batch.acquired) {
      logger.info('[notification-digest] Express fallback stopped because another runner owns the advisory lock', {
        digestsCreated,
        rowsMarkedRead,
        batches,
      });
      return 'busy';
    }

    const nextUserId = batch.value.lastUserId;
    digestsCreated += Number(batch.value.digestsCreated);
    rowsMarkedRead += Number(batch.value.rowsMarkedRead);
    if (nextUserId === null) break;
    if (nextUserId === lastUserId) {
      throw new Error('Notification digest cursor did not advance');
    }

    lastUserId = nextUserId;
    batches += 1;
  }

  logger.info('[notification-digest] Express fallback completed', {
    digestsCreated,
    rowsMarkedRead,
    batches,
  });
  return 'completed';
}

async function main(): Promise<void> {
  await executeWithGoFallback<NotificationDigestResult>({
    jobName: 'notification-digest',
    path: '/internal/jobs/notification-digest',
    body: {},
    validateResult: isNotificationDigestResult,
    runExpressFallback,
  });
}

main()
  .catch(error => {
    logger.error('dailyNotificationDigest failed', { err: error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
