/**
 * Retains resolved FailedBackgroundTask rows and reports unresolved backlog.
 * Unresolved rows and rows with a NULL resolvedAt are never deleted.
 */
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import { env } from '../config/env';
import {
  executeWithGoFallback,
  runAdvisoryLockedBatch,
} from '../shared/go-worker/executeWithFallback';

const prisma = new PrismaClient();
const RETENTION_DAYS = env.reports.failedTaskRetentionDays;
const BATCH_SIZE = 500;
// Must match failedTaskRetentionLockID in apps/go-worker/cmd/server/main.go.
const FAILED_TASK_RETENTION_LOCK_ID = 731904284n;

type FailedTaskRetentionResult = {
  deleted: number;
  batches: number;
  cutoff: string;
  retentionDays: number;
};

function isFailedTaskRetentionResult(value: unknown): value is FailedTaskRetentionResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(result.deleted) && (result.deleted as number) >= 0 &&
    Number.isSafeInteger(result.batches) && (result.batches as number) >= 0 &&
    result.retentionDays === RETENTION_DAYS &&
    typeof result.cutoff === 'string' && Number.isFinite(Date.parse(result.cutoff))
  );
}

async function deleteResolvedBatch(tx: Prisma.TransactionClient, cutoff: Date): Promise<number> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    WITH doomed AS (
      SELECT id
      FROM "failed_background_tasks"
      WHERE "resolved" = TRUE
        AND "resolvedAt" IS NOT NULL
        AND "resolvedAt" < ${cutoff}
      ORDER BY "resolvedAt" ASC, id ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    DELETE FROM "failed_background_tasks" AS task
    USING doomed
    WHERE task.id = doomed.id
    RETURNING task.id
  `;
  return rows.length;
}

async function runExpressFallback(): Promise<'completed' | 'busy'> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000);
  let deleted = 0;
  let batches = 0;

  for (;;) {
    const batch = await runAdvisoryLockedBatch(prisma, FAILED_TASK_RETENTION_LOCK_ID, tx =>
      deleteResolvedBatch(tx, cutoff)
    );

    if (!batch.acquired) {
      logger.info('[failed-task-retention] Express fallback skipped because another runner owns the advisory lock', {
        deleted,
        batches,
      });
      return 'busy';
    }

    deleted += batch.value;
    if (batch.value > 0) batches += 1;
    if (batch.value < BATCH_SIZE) break;
  }

  logger.info('[failed-task-retention] Express fallback completed', {
    deleted,
    batches,
    cutoff: cutoff.toISOString(),
    retentionDays: RETENTION_DAYS,
  });
  return 'completed';
}

async function logUnresolvedBacklog(): Promise<void> {
  const unresolvedByType = await prisma.failedBackgroundTask.groupBy({
    by: ['taskType'],
    where: { resolved: false },
    _count: { _all: true },
  });
  const unresolvedTotal = unresolvedByType.reduce((sum, row) => sum + row._count._all, 0);

  logger.info('[failed-task-retention] unresolved backlog', {
    unresolvedTotal,
    unresolvedByType: Object.fromEntries(unresolvedByType.map(row => [row.taskType, row._count._all])),
  });
}

async function main(): Promise<void> {
  if (!Number.isSafeInteger(RETENTION_DAYS) || RETENTION_DAYS < 1 || RETENTION_DAYS > 3650) {
    throw new Error('FAILED_TASK_RETENTION_DAYS must be an integer between 1 and 3650');
  }

  await executeWithGoFallback<FailedTaskRetentionResult>({
    jobName: 'failed-task-retention',
    path: '/internal/jobs/failed-task-retention',
    body: { retentionDays: RETENTION_DAYS },
    validateResult: isFailedTaskRetentionResult,
    runExpressFallback,
  });

  await logUnresolvedBacklog();
}

main()
  .catch(error => {
    logger.error('[failed-task-retention] cleanup failed', { err: error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
