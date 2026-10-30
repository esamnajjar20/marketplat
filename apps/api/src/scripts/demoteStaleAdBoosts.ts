/**
 * Demotes featured/pinned flags on ACTIVE ads that have not been updated for
 * STALE_BOOST_DAYS. Does not change ad status. Go is preferred; the bounded
 * Prisma/SQL fallback uses the identical PostgreSQL advisory lock.
 */
import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import { env } from '../config/env';
import { bumpAdsCacheVersion } from '../modules/ads/ads.cache.keys';
import { flushEdgePurge } from '../shared/cache/edgePurge';
import { redis } from '../config/redis';
import {
  executeWithGoFallback,
  runAdvisoryLockedBatch,
} from '../shared/go-worker/executeWithFallback';

const prisma = new PrismaClient();
const STALE_BOOST_DAYS = env.reports.staleBoostDays;
const DRY_RUN = env.reports.dryRun;
const BATCH_SIZE = 1_000;
// Must match staleBoostDemotionLockID in apps/go-worker/cmd/server/main.go.
const STALE_BOOST_DEMOTION_LOCK_ID = 731904297n;

type StaleBoostResult = {
  candidates: number;
  updated: number;
  batches: number;
  olderThan: string;
  staleBoostDays: number;
  dryRun: boolean;
};

function isStaleBoostResult(value: unknown): value is StaleBoostResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(result.candidates) && (result.candidates as number) >= 0 &&
    Number.isSafeInteger(result.updated) && (result.updated as number) >= 0 &&
    Number.isSafeInteger(result.batches) && (result.batches as number) >= 0 &&
    typeof result.olderThan === 'string' && Number.isFinite(Date.parse(result.olderThan)) &&
    result.staleBoostDays === STALE_BOOST_DAYS &&
    result.dryRun === DRY_RUN
  );
}

async function refreshAdsCaches(): Promise<void> {
  try {
    // Boost flags affect ad list ordering. The cache generation must move
    // before the edge purge, just as it did in the original Express script.
    await bumpAdsCacheVersion();
    await flushEdgePurge();
  } catch (error) {
    // The database transition is already committed; never rerun it merely
    // because the best-effort cache refresh failed.
    logger.error('[demote-stale-boosts] cache invalidation failed after DB update', { error });
  }
}

async function runExpressFallback(): Promise<'completed' | 'busy'> {
  const now = new Date();
  const olderThan = new Date(now.getTime() - STALE_BOOST_DAYS * 24 * 60 * 60 * 1_000);
  let candidates = 0;
  let updated = 0;
  let batches = 0;
  let firstBatch = true;

  for (;;) {
    const batch = await runAdvisoryLockedBatch(prisma, STALE_BOOST_DEMOTION_LOCK_ID, async tx => {
      if (firstBatch) {
        const counts = await tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM "ads"
          WHERE "status" = 'ACTIVE'
            AND "updatedAt" < ${olderThan}
            AND ("isFeatured" = TRUE OR "isPinned" = TRUE)
        `;
        candidates = Number(counts[0]?.count ?? 0n);
      }
      if (DRY_RUN || candidates === 0) return 0;

      const rows = await tx.$queryRaw<{ id: string }[]>`
        WITH stale AS (
          SELECT id
          FROM "ads"
          WHERE "status" = 'ACTIVE'
            AND "updatedAt" < ${olderThan}
            AND ("isFeatured" = TRUE OR "isPinned" = TRUE)
          ORDER BY "updatedAt" ASC, id ASC
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "ads" AS ad
        SET "isFeatured" = FALSE,
            "isPinned" = FALSE,
            "updatedAt" = ${now}
        FROM stale
        WHERE ad.id = stale.id
          AND ad."status" = 'ACTIVE'
        RETURNING ad.id
      `;
      firstBatch = false;
      return rows.length;
    }, { transactionTimeoutMs: 20_000 });

    if (!batch.acquired) {
      logger.info('[demote-stale-boosts] Express fallback skipped because another runner owns the advisory lock', {
        candidates,
        updated,
        batches,
      });
      return 'busy';
    }

    if (DRY_RUN) break;
    updated += batch.value;
    if (batch.value > 0) batches += 1;
    if (batch.value < BATCH_SIZE) break;
  }

  if (updated > 0) await refreshAdsCaches();
  logger.info('[demote-stale-boosts] Express fallback completed', {
    candidates,
    updated,
    batches,
    olderThan: olderThan.toISOString(),
    staleBoostDays: STALE_BOOST_DAYS,
    dryRun: DRY_RUN,
  });
  return 'completed';
}

async function main(): Promise<void> {
  // Guard before either Go or Express path: a misconfigured zero/negative
  // cutoff must never turn into a near-global boost demotion in fallback.
  if (!Number.isInteger(STALE_BOOST_DAYS) || STALE_BOOST_DAYS < 1 || STALE_BOOST_DAYS > 3650) {
    throw new Error('STALE_BOOST_DAYS must be an integer between 1 and 3650');
  }

  await executeWithGoFallback<StaleBoostResult>({
    jobName: 'demote-stale-boosts',
    path: '/internal/jobs/demote-stale-boosts',
    body: { staleBoostDays: STALE_BOOST_DAYS, dryRun: DRY_RUN },
    validateResult: isStaleBoostResult,
    onGoSuccess: async result => {
      if (!result.dryRun && result.updated > 0) await refreshAdsCaches();
    },
    runExpressFallback,
  });
}

main()
  .catch(err => {
    logger.error('[demote-stale-boosts] job failed', { err });
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
  });
