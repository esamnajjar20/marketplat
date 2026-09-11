/**
 * Demotes featured/pinned flags on ACTIVE ads that have not been updated
 * for STALE_BOOST_DAYS. Does NOT change status (no auto-delete).
 *
 * Env:
 *   STALE_BOOST_DAYS (default 60)
 *   DRY_RUN=1 — log counts only, no writes
 *
 * Usage:
 *   npm run report:demote-stale-boosts
 */
import { PrismaClient } from "@prisma/client";
import { logger } from "../shared/utils/logger";
import { env } from "../config/env";

const prisma = new PrismaClient();
const STALE_BOOST_DAYS = env.reports.staleBoostDays;
const DRY_RUN = env.reports.dryRun;

async function main(): Promise<void> {
  const olderThan = new Date(
    Date.now() - STALE_BOOST_DAYS * 24 * 60 * 60 * 1000,
  );

  const where = {
    status: "ACTIVE" as const,
    updatedAt: { lt: olderThan },
    OR: [{ isFeatured: true }, { isPinned: true }],
  };

  const candidates = await prisma.ad.count({ where });

  if (DRY_RUN) {
    logger.info("demoteStaleAdBoosts DRY_RUN", {
      candidates,
      olderThan: olderThan.toISOString(),
      staleBoostDays: STALE_BOOST_DAYS,
    });
    return;
  }

  const result = await prisma.ad.updateMany({
    where,
    data: { isFeatured: false, isPinned: false },
  });

  logger.info("demoteStaleAdBoosts finished", {
    updated: result.count,
    olderThan: olderThan.toISOString(),
    staleBoostDays: STALE_BOOST_DAYS,
  });
}

main()
  .catch((err) => {
    logger.error("demoteStaleAdBoosts failed", { err });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
