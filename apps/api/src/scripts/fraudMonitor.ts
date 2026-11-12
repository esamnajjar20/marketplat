import { prisma } from '../config/prisma';
import { fraudMonitorService } from '../modules/trust/fraud/fraud-monitor.service';
import { logger } from '../shared/observability/logger';

async function main(): Promise<void> {
  const scheduledFor = process.env.MARKETPLAT_SCHEDULED_FOR?.trim() ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
    throw new Error('MARKETPLAT_SCHEDULED_FOR is required for the scheduled fraud monitor');
  }

  const ran = await fraudMonitorService.runScheduledScan(scheduledFor);
  const prunedRuns = await fraudMonitorService.pruneHistory();
  logger.info('[fraud-monitor] scheduled history scan finished', {
    scheduledFor,
    ran,
    retentionDays: 180,
    prunedRuns,
  });
}

main()
  .catch(error => {
    logger.error('[fraud-monitor] scheduled job failed', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
