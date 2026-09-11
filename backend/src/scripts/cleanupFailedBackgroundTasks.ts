/**
 * Retention for FailedBackgroundTask:
 *  - Deletes resolved rows older than RESOLVED_RETENTION_DAYS
 *  - Logs unresolved backlog (does not auto-retry — handlers vary by taskType)
 *
 * Usage:
 *   npm run report:cleanup-failed-tasks
 */
import { PrismaClient } from "@prisma/client";
import { logger } from "../shared/utils/logger";
import { env } from "../config/env";

const prisma = new PrismaClient();
const RESOLVED_RETENTION_DAYS = env.reports.failedTaskRetentionDays;

async function main(): Promise<void> {
  const olderThan = new Date(
    Date.now() - RESOLVED_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );

  const deleted = await prisma.failedBackgroundTask.deleteMany({
    where: {
      resolved: true,
      resolvedAt: { lt: olderThan },
    },
  });

  const unresolvedByType = await prisma.failedBackgroundTask.groupBy({
    by: ["taskType"],
    where: { resolved: false },
    _count: { _all: true },
  });

  const unresolvedTotal = unresolvedByType.reduce(
    (sum, row) => sum + row._count._all,
    0,
  );

  logger.info("cleanupFailedBackgroundTasks finished", {
    deletedResolved: deleted.count,
    resolvedRetentionDays: RESOLVED_RETENTION_DAYS,
    olderThan: olderThan.toISOString(),
    unresolvedTotal,
    unresolvedByType: Object.fromEntries(
      unresolvedByType.map((r) => [r.taskType, r._count._all]),
    ),
  });
}

main()
  .catch((err) => {
    logger.error("cleanupFailedBackgroundTasks failed", { err });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
