import { prisma } from '../config/prisma';
import { logger } from '../shared/observability/logger';
import { executeTransactionalJobWithGoFallback } from '../shared/go-worker/transactionalJobFallback';
import { runSalesNotificationExpressFallback } from '../shared/go-worker/scheduledJobFallbacks';
import { notificationDispatcher } from '../shared/notifications/notificationDispatcher';

const LOCK_ID = 731904293n;

type Result = {
  job: 'weekly-report';
  notificationsCreated: number;
  pushDispatchesCreated: number;
  evaluatedAt: string;
  notificationIds: string[];
};
const isResult = (value: unknown): value is Result => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    row.job === 'weekly-report' &&
    Number.isSafeInteger(row.notificationsCreated) &&
    Number.isSafeInteger(row.pushDispatchesCreated) &&
    typeof row.evaluatedAt === 'string' &&
    Number.isFinite(Date.parse(row.evaluatedAt)) &&
    Array.isArray(row.notificationIds) &&
    row.notificationIds.every(id => typeof id === 'string' && id.length > 0) &&
    row.notificationIds.length === row.notificationsCreated
  );
};

async function main(): Promise<void> {
  await executeTransactionalJobWithGoFallback(prisma, {
    jobName: 'weekly-sales-report',
    path: '/internal/jobs/weekly-sales-report',
    lockId: LOCK_ID,
    validateResult: isResult,
    runExpressFallback: tx => runSalesNotificationExpressFallback(tx, 'weekly-report'),
    onGoSuccess: result => notificationDispatcher.publishDurable(prisma, result.notificationIds, 'sales-weekly-report Go worker'),
    onExpressFallbackSuccess: result => {
      if (result && typeof result === 'object' && 'notificationIds' in result && Array.isArray(result.notificationIds)) {
        return notificationDispatcher.publishDurable(prisma, result.notificationIds as string[], 'sales-weekly-report Express fallback');
      }
    },
  });
}

main()
  .catch(error => {
    logger.error('[weeklySalesReport] run failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
