import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import { executeTransactionalJobWithGoFallback } from '../shared/go-worker/transactionalJobFallback';
import { runInventoryMonitorExpressFallback } from '../shared/go-worker/scheduledJobFallbacks';
import { publishDurableNotifications } from '../shared/go-worker/publishDurableNotifications';

const prisma = new PrismaClient();
// Must match inventorymonitor.AdvisoryLockID in apps/go-worker.
const LOCK_ID = 731904304n;

type Result = {
  lockAcquired: true;
  candidatesScanned: number;
  eventsClaimed: number;
  notificationsCreated: number;
  pushDispatchesCreated: number;
  notificationIds: string[];
};

function isResult(value: unknown): value is Result {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const countKeys = ['candidatesScanned', 'eventsClaimed', 'notificationsCreated', 'pushDispatchesCreated'];
  return row.lockAcquired === true &&
    countKeys.every(key => Number.isSafeInteger(row[key]) && (row[key] as number) >= 0) &&
    (row.eventsClaimed as number) === (row.notificationsCreated as number) &&
    (row.notificationsCreated as number) === (row.pushDispatchesCreated as number) &&
    Array.isArray(row.notificationIds) && row.notificationIds.every(id => typeof id === 'string') &&
    row.notificationIds.length === row.notificationsCreated;
}

async function publishCommittedNotifications(result: Result): Promise<void> {
  await publishDurableNotifications(prisma, result.notificationIds, 'inventory-monitor');
}

async function publishExpressFallbackNotifications(value: unknown): Promise<void> {
  if (isResult(value)) await publishCommittedNotifications(value);
}

async function main(): Promise<void> {
  await executeTransactionalJobWithGoFallback<Result>(prisma, {
    jobName: 'inventory-monitor',
    path: '/internal/jobs/inventory-monitor',
    lockId: LOCK_ID,
    validateResult: isResult,
    timeoutMs: 30_000,
    transactionTimeoutMs: 25_000,
    runExpressFallback: tx => runInventoryMonitorExpressFallback(tx),
    onGoSuccess: publishCommittedNotifications,
    onExpressFallbackSuccess: publishExpressFallbackNotifications,
  });
}

main().catch(error => {
  logger.error('[inventoryMonitor] scheduled run failed', { error });
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
