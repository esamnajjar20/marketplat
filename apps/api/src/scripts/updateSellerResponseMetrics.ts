import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import { executeTransactionalJobWithGoFallback } from '../shared/go-worker/transactionalJobFallback';
import { runSellerResponseMetricsExpressFallback } from '../shared/go-worker/scheduledJobFallbacks';

const prisma = new PrismaClient();
const LOCK_ID = 731904289n;

type Result = { updated: number; windowDays: number; windowStart: string };
const isResult = (value: unknown): value is Result => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return Number.isSafeInteger(row.updated) && (row.updated as number) >= 0 &&
    row.windowDays === 90 && typeof row.windowStart === 'string' && Number.isFinite(Date.parse(row.windowStart));
};

async function main(): Promise<void> {
  await executeTransactionalJobWithGoFallback(prisma, {
    jobName: 'seller-response-metrics', path: '/internal/jobs/seller-response-metrics', lockId: LOCK_ID,
    validateResult: isResult,
    runExpressFallback: tx => runSellerResponseMetricsExpressFallback(tx, new Date(), 90),
  });
}

main().catch(error => {
  logger.error('[updateSellerResponseMetrics] run failed', { error });
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
