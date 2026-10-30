import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import { executeTransactionalJobWithGoFallback } from '../shared/go-worker/transactionalJobFallback';
import { runWeeklyViewsExpressFallback } from '../shared/go-worker/scheduledJobFallbacks';

const prisma = new PrismaClient();
const LOCK_ID = 731904288n;

type Result = { kind: 'services'; notificationsCreated: number; baselinesAdvanced: number; ownersConsidered: number; runKey: string };
const isResult = (value: unknown): value is Result => {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return row.kind === 'services' && Number.isSafeInteger(row.notificationsCreated) &&
    Number.isSafeInteger(row.baselinesAdvanced) && Number.isSafeInteger(row.ownersConsidered) &&
    typeof row.runKey === 'string';
};

async function main(): Promise<void> {
  await executeTransactionalJobWithGoFallback(prisma, {
    jobName: 'weekly-service-views', path: '/internal/jobs/weekly-service-views', lockId: LOCK_ID,
    validateResult: isResult,
    runExpressFallback: tx => runWeeklyViewsExpressFallback(tx, 'services'),
  });
}

main().catch(error => {
  logger.error('[weeklyServiceViewsReport] run failed', { error });
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
