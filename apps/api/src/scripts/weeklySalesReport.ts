import { prisma } from '../config/prisma';
import { logger } from '../shared/observability/logger';
import { executeTransactionalJobWithGoFallback } from '../shared/go-worker/transactionalJobFallback';
import { runSalesNotificationExpressFallback } from '../shared/go-worker/scheduledJobFallbacks';

const LOCK_ID = 731904293n;

type Result = { job: 'weekly-report'; notificationsCreated: number; pushDispatchesCreated: number; evaluatedAt: string };
const isResult = (value: unknown): value is Result => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.job === 'weekly-report' && Number.isSafeInteger(row.notificationsCreated) &&
    Number.isSafeInteger(row.pushDispatchesCreated) && typeof row.evaluatedAt === 'string' &&
    Number.isFinite(Date.parse(row.evaluatedAt));
};

async function main(): Promise<void> {
  await executeTransactionalJobWithGoFallback(prisma, {
    jobName: 'weekly-sales-report', path: '/internal/jobs/weekly-sales-report', lockId: LOCK_ID,
    validateResult: isResult,
    runExpressFallback: tx => runSalesNotificationExpressFallback(tx, 'weekly-report'),
  });
}

main().catch(error => {
  logger.error('[weeklySalesReport] run failed', { error });
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
