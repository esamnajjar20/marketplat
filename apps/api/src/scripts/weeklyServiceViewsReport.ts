import { prisma } from '../config/prisma';
import { logger } from '../shared/observability/logger';
import { executeTransactionalJobWithGoFallback } from '../shared/go-worker/transactionalJobFallback';
import { runWeeklyViewsExpressFallback } from '../shared/go-worker/scheduledJobFallbacks';
import { notificationDispatcher } from '../shared/notifications/notificationDispatcher';

const LOCK_ID = 731904288n;

type Result = {
  kind: 'services';
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
    row.kind === 'services' &&
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
    jobName: 'weekly-service-views',
    path: '/internal/jobs/weekly-service-views',
    lockId: LOCK_ID,
    validateResult: isResult,
    runExpressFallback: tx => runWeeklyViewsExpressFallback(tx, 'services'),
    onGoSuccess: result => notificationDispatcher.publishDurable(prisma, result.notificationIds, 'weekly-service-views Go worker'),
    onExpressFallbackSuccess: result => {
      if (result && typeof result === 'object' && 'notificationIds' in result && Array.isArray(result.notificationIds)) {
        return notificationDispatcher.publishDurable(prisma, result.notificationIds as string[], 'weekly-service-views Express fallback');
      }
    },
  });
}

main()
  .catch(error => {
    logger.error('[weeklyServiceViewsReport] run failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
