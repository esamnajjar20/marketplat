import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../shared/observability/logger';
import { executeWithGoFallback, runAdvisoryLockedBatch } from '../shared/go-worker/executeWithFallback';

const LOCK_ID = 731904302n; // Must match analyticsrollup.AdvisoryLockID in Go.
const BACKFILL_DAYS = 14;
const REFRESH_RECENT_DAYS = 3;

type RollupResult = {
  windowStart: string;
  windowEnd: string;
  plannedDays: number;
  rebuiltDays: number;
  skippedDays: number;
  sourceEvents: number;
  rollupRows: number;
  prunedDays: number;
  prunedRows: number;
  processedDays: string[];
};

function isRollupResult(value: unknown): value is RollupResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  const nonNegativeInt = (item: unknown) => Number.isSafeInteger(item) && (item as number) >= 0;
  return typeof result.windowStart === 'string' && Number.isFinite(Date.parse(result.windowStart)) &&
    typeof result.windowEnd === 'string' && Number.isFinite(Date.parse(result.windowEnd)) &&
    ['plannedDays', 'rebuiltDays', 'skippedDays', 'sourceEvents', 'rollupRows', 'prunedDays', 'prunedRows'].every(key => nonNegativeInt(result[key])) &&
    Array.isArray(result.processedDays) && result.processedDays.every(day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)) &&
    (result.rebuiltDays as number) + (result.skippedDays as number) <= (result.plannedDays as number);
}

function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function rebuildDay(day: Date): Promise<{ status: 'rebuilt' | 'busy'; sourceEvents: bigint; rollupRows: number }> {
  const key = dayKey(day);
  const result = await runAdvisoryLockedBatch(prisma, LOCK_ID, async tx => {
    await tx.$executeRaw`DELETE FROM "analytics_event_daily_rollups" WHERE "bucketDate" = ${key}::date`;
    const rows = await tx.$queryRaw<Array<{ eventCount: bigint }>>`
      INSERT INTO "analytics_event_daily_rollups"
        ("bucketDate", "event", "categoryId", "eventCount", "updatedAt")
      SELECT ${key}::date,
             "event",
             CASE WHEN "event" = 'CATEGORY_BROWSE'
                  THEN COALESCE("metadata"->>'categoryId', '')
                  ELSE '' END,
             COUNT(*)::bigint,
             NOW()
      FROM "analytics_events"
      WHERE "createdAt" >= ${key}::date AND "createdAt" < (${key}::date + INTERVAL '1 day')
      GROUP BY "event",
               CASE WHEN "event" = 'CATEGORY_BROWSE'
                    THEN COALESCE("metadata"->>'categoryId', '')
                    ELSE '' END
      RETURNING "eventCount"
    `;
    const sourceEvents = rows.reduce((sum, row) => sum + row.eventCount, 0n);
    await tx.$executeRaw`
      INSERT INTO "analytics_rollup_days" ("bucketDate", "sourceEventCount", "rollupRowCount", "computedAt")
      VALUES (${key}::date, ${sourceEvents}, ${rows.length}, NOW())
      ON CONFLICT ("bucketDate") DO UPDATE
      SET "sourceEventCount" = EXCLUDED."sourceEventCount",
          "rollupRowCount" = EXCLUDED."rollupRowCount",
          "computedAt" = NOW()
    `;
    return { sourceEvents, rollupRows: rows.length };
  }, { transactionTimeoutMs: 20_000 });
  return result.acquired
    ? { status: 'rebuilt', sourceEvents: result.value.sourceEvents, rollupRows: result.value.rollupRows }
    : { status: 'busy', sourceEvents: 0n, rollupRows: 0 };
}

async function runExpressFallback(): Promise<'completed' | 'busy'> {
  const today = utcMidnight(new Date());
  const rawWindowDays = env.analytics.retentionDays;
  if (!Number.isInteger(rawWindowDays) || rawWindowDays < 1 || rawWindowDays > 3_650) {
    throw new Error('ANALYTICS_RETENTION_DAYS must be between 1 and 3650 for analytics rollups');
  }
  const rollupRetentionDays = Math.max(400, rawWindowDays);
  const windowStart = new Date(today);
  windowStart.setUTCDate(windowStart.getUTCDate() - rawWindowDays);
  const completedRows = await prisma.$queryRaw<Array<{ dayKey: string }>>`
    SELECT to_char("bucketDate", 'YYYY-MM-DD') AS "dayKey"
    FROM "analytics_rollup_days"
    WHERE "bucketDate" >= ${dayKey(windowStart)}::date AND "bucketDate" < ${dayKey(today)}::date
  `;
  const completed = new Set(completedRows.map(row => row.dayKey));
  const planned: Date[] = [];
  const seen = new Set<string>();
  const add = (day: Date) => {
    const key = dayKey(day);
    if (!seen.has(key)) {
      seen.add(key);
      planned.push(day);
    }
  };

  let missing = 0;
  for (let day = new Date(windowStart); day < today && missing < BACKFILL_DAYS; day.setUTCDate(day.getUTCDate() + 1)) {
    if (!completed.has(dayKey(day))) {
      add(new Date(day));
      missing += 1;
    }
  }
  for (let offset = REFRESH_RECENT_DAYS; offset >= 1; offset -= 1) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - offset);
    if (day >= windowStart) add(day);
  }

  let rebuiltDays = 0;
  let skippedDays = 0;
  let sourceEvents = 0n;
  let rollupRows = 0;
  for (const day of planned) {
    const outcome = await rebuildDay(day);
    if (outcome.status === 'busy') {
      skippedDays += 1;
      continue;
    }
    rebuiltDays += 1;
    sourceEvents += outcome.sourceEvents;
    rollupRows += outcome.rollupRows;
  }

  const pruneBefore = new Date(today);
  pruneBefore.setUTCDate(pruneBefore.getUTCDate() - rollupRetentionDays);
  const pruned = await prisma.$queryRaw<Array<{ prunedDays: bigint; prunedRows: bigint }>>`
    WITH deleted_rollups AS (
      DELETE FROM "analytics_event_daily_rollups" WHERE "bucketDate" < ${dayKey(pruneBefore)}::date RETURNING 1
    ), deleted_days AS (
      DELETE FROM "analytics_rollup_days" WHERE "bucketDate" < ${dayKey(pruneBefore)}::date RETURNING 1
    )
    SELECT COUNT(*)::bigint AS "prunedDays",
           (SELECT COUNT(*)::bigint FROM deleted_rollups) AS "prunedRows"
  `;

  logger.info('[analytics-rollup] Express fallback completed', {
    plannedDays: planned.length,
    rebuiltDays,
    skippedDays,
    sourceEvents: Number(sourceEvents),
    rollupRows,
    prunedDays: Number(pruned[0]?.prunedDays ?? 0n),
    prunedRows: Number(pruned[0]?.prunedRows ?? 0n),
  });
  return planned.length > 0 && rebuiltDays === 0 && skippedDays > 0 ? 'busy' : 'completed';
}

async function main(): Promise<void> {
  const outcome = await executeWithGoFallback<RollupResult>({
    jobName: 'analytics-daily-rollup',
    path: '/internal/jobs/analytics-rollup',
    body: {},
    timeoutMs: 12 * 60 * 1_000,
    validateResult: isRollupResult,
    runExpressFallback,
  });
  logger.info('[analytics-rollup] job finished', { outcome });
}

main()
  .catch(error => {
    logger.error('[analytics-rollup] job failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
