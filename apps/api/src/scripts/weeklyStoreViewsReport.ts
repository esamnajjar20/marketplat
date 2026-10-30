import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import { executeTransactionalJobWithGoFallback } from '../shared/go-worker/transactionalJobFallback';
import { runWeeklyViewsExpressFallback } from '../shared/go-worker/scheduledJobFallbacks';

const prisma = new PrismaClient();
const LOCK_ID = 731904287n;

type Result = { kind: 'stores'; notificationsCreated: number; baselinesAdvanced: number; ownersConsidered: number; runKey: string };
const isResult = (value: unknown): value is Result => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.kind === 'stores' && Number.isSafeInteger(row.notificationsCreated) &&
    Number.isSafeInteger(row.baselinesAdvanced) && Number.isSafeInteger(row.ownersConsidered) &&
    typeof row.runKey === 'string';
};

async function main(): Promise<void> {
  await executeTransactionalJobWithGoFallback(prisma, {
    jobName: 'weekly-store-views', path: '/internal/jobs/weekly-store-views', lockId: LOCK_ID,
    validateResult: isResult,
    runExpressFallback: tx => runWeeklyViewsExpressFallback(tx, 'stores'),
  });
}

main().catch(error => {
  logger.error('[weeklyStoreViewsReport] run failed', { error });
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
