/**
 * Weekly service-listing views delta report for providers.
 * Mirrors weeklyStoreViewsReport.ts — aggregate listing views per provider owner.
 *
 * Requires: ServiceListing.viewsAtLastReport (migration).
 */
import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import { pushService } from '../shared/utils/pushService';

const prisma = new PrismaClient();

type ProviderDelta = {
  userId: string;
  totalDelta: number;
  providerId: string;
  // T610 — the exact listing ids that contributed to totalDelta, so the
  // baseline advance below can touch ONLY those rows. Previously
  // advanceBaseline(providerId) updated every listing belonging to the
  // provider, including any listing whose views grew *after* the
  // SELECT ran — that listing's viewsAtLastReport would be advanced
  // without its delta having been reported, silently dropping those
  // views from the next report. Same scoping pattern as
  // weeklyAdViewsReport.ts's advanceBaseline(adIds).
  listingIds: string[];
};

async function findProviderDeltas(): Promise<ProviderDelta[]> {
  const rows = await prisma.$queryRaw<
    { userId: string; providerId: string; totalDelta: bigint; listingIds: string[] }[]
  >`
    SELECT
      u."id" AS "userId",
      spd."id" AS "providerId",
      SUM(sl."views" - sl."viewsAtLastReport")::bigint AS "totalDelta",
      ARRAY_AGG(sl."id") AS "listingIds"
    FROM "service_listings" sl
    INNER JOIN "service_provider_details" spd ON spd."id" = sl."providerId"
    INNER JOIN "seller_profiles" sp ON sp."id" = spd."sellerProfileId"
    INNER JOIN "users" u ON u."id" = sp."userId"
    WHERE sl."status" = 'ACTIVE'
      AND sl."views" > sl."viewsAtLastReport"
      AND (u."notificationPreferences" ->> 'adViews') = 'true'
    GROUP BY u."id", spd."id"
  `;

  return rows
    .map(r => ({
      userId: r.userId,
      providerId: r.providerId,
      totalDelta: Number(r.totalDelta),
      listingIds: r.listingIds,
    }))
    .filter(r => r.totalDelta > 0);
}

async function advanceBaseline(listingIds: string[]): Promise<void> {
  if (listingIds.length === 0) return;
  await prisma.$executeRaw`
    UPDATE "service_listings"
    SET "viewsAtLastReport" = "views"
    WHERE "id" = ANY(${listingIds})
  `;
}

async function main(): Promise<void> {
  const deltas = await findProviderDeltas();

  if (deltas.length === 0) {
    logger.info('[weeklyServiceViewsReport] nothing to report');
    return;
  }

  let sent = 0;
  for (const { userId, totalDelta, providerId, listingIds } of deltas) {
    const title = 'تقرير مشاهدات خدماتك الأسبوعي';
    const body =
      totalDelta === 1
        ? 'حصلت خدماتك على مشاهدة جديدة هذا الأسبوع'
        : `حصلت خدماتك على ${totalDelta} مشاهدة جديدة هذا الأسبوع`;

    try {
      await pushService
        .notifyUser(userId, {
          title,
          body,
          url: '/my-services?tab=analytics',
          tag: 'weekly-service-views-report',
          type: 'WEEKLY_SERVICE_VIEWS_REPORT',
        })
        .catch(() => {});

      await prisma.notification.create({
        data: {
          userId,
          type: 'WEEKLY_SERVICE_VIEWS_REPORT',
          title,
          body,
          data: { totalDelta, providerId },
        },
      });
      await advanceBaseline(listingIds);
      sent += 1;
    } catch (err) {
      logger.error('[weeklyServiceViewsReport] failed to send report', {
        err,
        userId,
      });
    }
  }

  logger.info(`[weeklyServiceViewsReport] sent ${sent}/${deltas.length} report(s)`);
}

main()
  .catch(err => {
    logger.error('[weeklyServiceViewsReport] run failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
