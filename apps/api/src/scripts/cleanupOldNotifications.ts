/**
 * Retention job: deletes only read notifications older than 90 days, and never
 * removes a notification while a push dispatch remains unfinished.
 */
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import {
  executeWithGoFallback,
  runAdvisoryLockedBatch,
} from '../shared/go-worker/executeWithFallback';

const prisma = new PrismaClient();
const RETENTION_DAYS = 90;
const BATCH_SIZE = 500;
// Must match notificationRetentionLockID in apps/go-worker/cmd/server/main.go.
const NOTIFICATION_RETENTION_LOCK_ID = 731904283n;

type NotificationRetentionResult = {
  deleted: number;
  batches: number;
  cutoff: string;
  retentionDays: number;
};

function isNotificationRetentionResult(value: unknown): value is NotificationRetentionResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(result.deleted) && (result.deleted as number) >= 0 &&
    Number.isSafeInteger(result.batches) && (result.batches as number) >= 0 &&
    result.retentionDays === RETENTION_DAYS &&
    typeof result.cutoff === 'string' && Number.isFinite(Date.parse(result.cutoff))
  );
}

async function deleteReadNotificationBatch(
  tx: Prisma.TransactionClient,
  cutoff: Date
): Promise<number> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    WITH doomed AS (
      SELECT n."id"
      FROM "notifications" AS n
      WHERE n."readAt" IS NOT NULL
        AND n."createdAt" < ${cutoff}
        AND NOT EXISTS (
          SELECT 1
          FROM "notification_push_dispatches" AS dispatch
          WHERE dispatch."notificationId" = n."id"
            AND dispatch."processedAt" IS NULL
        )
      ORDER BY n."createdAt" ASC, n."id" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE OF n SKIP LOCKED
    )
    DELETE FROM "notifications" AS n
    USING doomed
    WHERE n."id" = doomed."id"
    RETURNING n."id"
  `;
  return rows.length;
}

async function runExpressFallback(): Promise<'completed' | 'busy'> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1_000);
  let deleted = 0;
  let batches = 0;

  for (;;) {
    const batch = await runAdvisoryLockedBatch(prisma, NOTIFICATION_RETENTION_LOCK_ID, tx =>
      deleteReadNotificationBatch(tx, cutoff)
    );

    if (!batch.acquired) {
      logger.info('[notification-retention] Express fallback skipped because another runner owns the advisory lock', {
        deleted,
        batches,
      });
      return 'busy';
    }

    deleted += batch.value;
    if (batch.value > 0) batches += 1;
    if (batch.value < BATCH_SIZE) break;
  }

  logger.info('[notification-retention] Express fallback completed', {
    deleted,
    batches,
    cutoff: cutoff.toISOString(),
    retentionDays: RETENTION_DAYS,
  });
  return 'completed';
}

async function main(): Promise<void> {
  await executeWithGoFallback<NotificationRetentionResult>({
    jobName: 'notification-retention',
    path: '/internal/jobs/notification-retention',
    body: { retentionDays: RETENTION_DAYS },
    validateResult: isNotificationRetentionResult,
    runExpressFallback,
  });
}

main()
  .catch(error => {
    logger.error('[notification-retention] cleanup failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
