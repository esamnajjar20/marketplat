/**
 * Weekly service-listing views delta report for providers.
 * Mirrors weeklyStoreViewsReport.ts — aggregate listing views per provider owner.
 *
 * Requires: ServiceListing.viewsAtLastReport (migration).
 */
import { PrismaClient } from "@prisma/client";
import { logger } from "../shared/utils/logger";
import { pushService } from "../shared/utils/pushService";

const prisma = new PrismaClient();

type ProviderDelta = {
  userId: string;
  totalDelta: number;
  providerId: string;
};

async function findProviderDeltas(): Promise<ProviderDelta[]> {
  const rows = await prisma.$queryRaw<
    { userId: string; providerId: string; totalDelta: bigint }[]
  >`
    SELECT
      u."id" AS "userId",
      spd."id" AS "providerId",
      SUM(sl."views" - sl."viewsAtLastReport")::bigint AS "totalDelta"
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
    .map((r) => ({
      userId: r.userId,
      providerId: r.providerId,
      totalDelta: Number(r.totalDelta),
    }))
    .filter((r) => r.totalDelta > 0);
}

async function advanceBaseline(providerId: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "service_listings"
    SET "viewsAtLastReport" = "views"
    WHERE "providerId" = ${providerId}
  `;
}

async function main(): Promise<void> {
  const deltas = await findProviderDeltas();

  if (deltas.length === 0) {
    logger.info("[weeklyServiceViewsReport] nothing to report");
    return;
  }

  let sent = 0;
  for (const { userId, totalDelta, providerId } of deltas) {
    const title = "تقرير مشاهدات خدماتك الأسبوعي";
    const body =
      totalDelta === 1
        ? "حصلت خدماتك على مشاهدة جديدة هذا الأسبوع"
        : `حصلت خدماتك على ${totalDelta} مشاهدة جديدة هذا الأسبوع`;

    try {
      void pushService
        .notifyUser(userId, {
          title,
          body,
          url: "/my-services/analytics",
          tag: "weekly-service-views-report",
        })
        .catch(() => {});

      await prisma.notification.create({
        data: {
          userId,
          type: "WEEKLY_SERVICE_VIEWS_REPORT",
          title,
          body,
          data: { totalDelta, providerId },
        },
      });
      await advanceBaseline(providerId);
      sent += 1;
    } catch (err) {
      logger.error("[weeklyServiceViewsReport] failed to send report", {
        err,
        userId,
      });
    }
  }

  logger.info(
    `[weeklyServiceViewsReport] sent ${sent}/${deltas.length} report(s)`,
  );
}

main()
  .catch((err) => {
    logger.error("[weeklyServiceViewsReport] run failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
