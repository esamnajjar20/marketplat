import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import { executeTransactionalJobWithGoFallback } from '../shared/go-worker/transactionalJobFallback';
import { runSalesNotificationExpressFallback } from '../shared/go-worker/scheduledJobFallbacks';

const prisma = new PrismaClient();
const LOCK_ID = 731904291n;

type Result = { job: 'debt-reminder'; notificationsCreated: number; pushDispatchesCreated: number; evaluatedAt: string };
const isResult = (value: unknown): value is Result => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.job === 'debt-reminder' && Number.isSafeInteger(row.notificationsCreated) &&
    Number.isSafeInteger(row.pushDispatchesCreated) && typeof row.evaluatedAt === 'string' &&
    Number.isFinite(Date.parse(row.evaluatedAt));
};

async function main(): Promise<void> {
  await executeTransactionalJobWithGoFallback(prisma, {
    jobName: 'sales-debt-reminder', path: '/internal/jobs/sales-debt-reminder', lockId: LOCK_ID,
    validateResult: isResult,
    runExpressFallback: tx => runSalesNotificationExpressFallback(tx, 'debt-reminder'),
  });
}

main().catch(error => {
  logger.error('[debtReminder] run failed', { error });
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
