import { prisma } from '../config/prisma';
import { logger } from '../shared/observability/logger';
import { executeTransactionalJobWithGoFallback } from '../shared/go-worker/transactionalJobFallback';
import { runWeeklyViewsExpressFallback } from '../shared/go-worker/scheduledJobFallbacks';
import { notificationDispatcher } from '../shared/notifications/notificationDispatcher';

const LOCK_ID = 731904286n;

type Result = {
  kind: 'ads';
  notificationsCreated: number;
  baselinesAdvanced: number;
  ownersConsidered: number;
  runKey: string;
  notificationIds: string[];
};
const isResult = (value: unknown): value is Result => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    row.kind === 'ads' &&
    Number.isSafeInteger(row.notificationsCreated) &&
    Number.isSafeInteger(row.baselinesAdvanced) &&
    Number.isSafeInteger(row.ownersConsidered) &&
    typeof row.runKey === 'string' &&
    Array.isArray(row.notificationIds) &&
    row.notificationIds.every(id => typeof id === 'string' && id.length > 0) &&
    row.notificationIds.length === row.notificationsCreated
  );
};

async function main(): Promise<void> {
  await executeTransactionalJobWithGoFallback(prisma, {
    jobName: 'weekly-ad-views',
    path: '/internal/jobs/weekly-ad-views',
    lockId: LOCK_ID,
    validateResult: isResult,
    runExpressFallback: tx => runWeeklyViewsExpressFallback(tx, 'ads'),
    onGoSuccess: result => notificationDispatcher.publishDurable(prisma, result.notificationIds, 'weekly-ad-views Go worker'),
    onExpressFallbackSuccess: result => {
      if (result && typeof result === 'object' && 'notificationIds' in result && Array.isArray(result.notificationIds)) {
        return notificationDispatcher.publishDurable(prisma, result.notificationIds as string[], 'weekly-ad-views Express fallback');
      }
    },
  });
}

main()
  .catch(error => {
    logger.error('[weeklyAdViewsReport] run failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
