import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../shared/utils/logger';
import {
  executeWithGoFallback,
  runAdvisoryLockedBatch,
} from '../shared/go-worker/executeWithFallback';

const BATCH_SIZE = 5_000;
// Must match analyticsRetentionLockID in apps/go-worker/cmd/server/main.go.
const ANALYTICS_RETENTION_LOCK_ID = 731904281n;

type AnalyticsRetentionResult = {
  cutoff: string;
  deleted: number;
  batches: number;
  retentionDays: number;
};

function isAnalyticsRetentionResult(value: unknown): value is AnalyticsRetentionResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(result.deleted) && (result.deleted as number) >= 0 &&
    Number.isSafeInteger(result.batches) && (result.batches as number) >= 0 &&
    result.retentionDays === env.analytics.retentionDays &&
    typeof result.cutoff === 'string' && Number.isFinite(Date.parse(result.cutoff))
  );
}

/**
 * Retains raw analytics for the configured window using bounded DELETEs.
 * Go executes the same SQL when available; each Express batch takes the same
 * advisory lock, so a network timeout cannot cause concurrent deletion runs.
 */
async function runExpressFallback(): Promise<'completed' | 'busy'> {
  const cutoff = new Date(Date.now() - env.analytics.retentionDays * 24 * 60 * 60 * 1_000);
  let deleted = 0;
  let batches = 0;

  for (;;) {
    const batch = await runAdvisoryLockedBatch(prisma, ANALYTICS_RETENTION_LOCK_ID, async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        WITH doomed AS (
          SELECT id
          FROM "analytics_events"
          WHERE "createdAt" < ${cutoff}
          ORDER BY "createdAt" ASC
          LIMIT ${BATCH_SIZE}
        )
        DELETE FROM "analytics_events" e
        USING doomed
        WHERE e.id = doomed.id
        RETURNING e.id
      `;
      return rows.length;
    }, { transactionTimeoutMs: 60_000 });

    if (!batch.acquired) {
      logger.info('[analytics-retention] Express fallback skipped because another runner owns the advisory lock', {
        deleted,
        batches,
      });
      return 'busy';
    }

    deleted += batch.value;
    if (batch.value > 0) batches += 1;
    if (batch.value < BATCH_SIZE) break;
  }

  logger.info('[analytics-retention] Express fallback completed', {
    cutoff: cutoff.toISOString(),
    deleted,
    batches,
    retentionDays: env.analytics.retentionDays,
  });
  return 'completed';
}

async function main(): Promise<void> {
  await executeWithGoFallback<AnalyticsRetentionResult>({
    jobName: 'analytics-retention',
    path: '/internal/jobs/analytics-retention',
    body: { retentionDays: env.analytics.retentionDays },
    validateResult: isAnalyticsRetentionResult,
    runExpressFallback,
  });
}

main()
  .catch(error => {
    logger.error('[analytics-retention] cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
