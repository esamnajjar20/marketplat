/**
 * Retention job — deletes *read* notifications older than RETENTION_DAYS.
 * Unread rows are never removed.
 *
 * Usage:
 *   npm run build && npm run report:cleanup-notifications
 */
import { PrismaClient } from "@prisma/client";
import { logger } from "../shared/utils/logger";

const prisma = new PrismaClient();
const RETENTION_DAYS = 90;

async function main(): Promise<void> {
  const olderThan = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.notification.deleteMany({
    where: {
      readAt: { not: null },
      createdAt: { lt: olderThan },
    },
  });
  logger.info("cleanupOldNotifications finished", {
    deleted: result.count,
    olderThan: olderThan.toISOString(),
    retentionDays: RETENTION_DAYS,
  });
}

main()
  .catch((err) => {
    logger.error("cleanupOldNotifications failed", { err });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
