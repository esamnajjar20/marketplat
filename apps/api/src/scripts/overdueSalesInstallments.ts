import { prisma } from '../config/prisma';
import { logger } from '../shared/observability/logger';
import { executeTransactionalJobWithGoFallback } from '../shared/go-worker/transactionalJobFallback';
import { runSalesNotificationExpressFallback } from '../shared/go-worker/scheduledJobFallbacks';
import { notificationDispatcher } from '../shared/notifications/notificationDispatcher';

const LOCK_ID = 731904292n;

type Result = {
  job: 'overdue-installments';
  notificationsCreated: number;
  pushDispatchesCreated: number;
  evaluatedAt: string;
  notificationIds: string[];
};
const isResult = (value: unknown): value is Result => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    row.job === 'overdue-installments' &&
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
    jobName: 'sales-overdue-installments',
    path: '/internal/jobs/sales-overdue-installments',
    lockId: LOCK_ID,
    validateResult: isResult,
    runExpressFallback: tx => runSalesNotificationExpressFallback(tx, 'overdue-installments'),
    onGoSuccess: result => notificationDispatcher.publishDurable(prisma, result.notificationIds, 'sales-overdue-installments Go worker'),
    onExpressFallbackSuccess: result => {
      if (result && typeof result === 'object' && 'notificationIds' in result && Array.isArray(result.notificationIds)) {
        return notificationDispatcher.publishDurable(prisma, result.notificationIds as string[], 'sales-overdue-installments Express fallback');
      }
    },
  });
}

main()
  .catch(error => {
    logger.error('[overdueSalesInstallments] run failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
