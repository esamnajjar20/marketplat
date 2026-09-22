/**
 * Weekly store-views report for store owners.
 * Cron example: 0 9 * * 1  npm run report:weekly-store-views
 *
 * Uses StoreDetails.views / viewsAtLastReport and opts in via the same
 * notificationPreferences.adViews key as weekly ad reports (sellers who
 * want view digests).
 */
import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import { pushService } from '../shared/utils/pushService';

const prisma = new PrismaClient();

interface OwnerDelta {
  userId: string;
  totalDelta: number;
  storeId: string;
}

async function findOwnerDeltas(): Promise<OwnerDelta[]> {
  const rows = await prisma.$queryRaw<{ userId: string; totalDelta: bigint; storeId: string }[]>`
    SELECT
      sp."userId" AS "userId",
      (s."views" - s."viewsAtLastReport") AS "totalDelta",
      s."id" AS "storeId"
    FROM "store_details" s
    INNER JOIN "seller_profiles" sp ON sp."id" = s."sellerProfileId"
    INNER JOIN "users" u ON u."id" = sp."userId"
    WHERE s."status" = 'ACTIVE'
      AND s."views" > s."viewsAtLastReport"
      AND (u."notificationPreferences" ->> 'adViews') = 'true'
  `;

  return rows
    .map(r => ({
      userId: r.userId,
      totalDelta: Number(r.totalDelta),
      storeId: r.storeId,
    }))
    .filter(r => r.totalDelta > 0);
}

async function advanceBaseline(storeIds: string[]): Promise<void> {
  if (storeIds.length === 0) return;
  await prisma.$executeRaw`
    UPDATE "store_details"
    SET "viewsAtLastReport" = "views"
    WHERE "id" = ANY(${storeIds})
  `;
}

async function main(): Promise<void> {
  const deltas = await findOwnerDeltas();

  if (deltas.length === 0) {
    logger.info('[weeklyStoreViewsReport] nothing to report');
    return;
  }

  let sent = 0;
  for (const { userId, totalDelta, storeId } of deltas) {
    const title = 'تقرير مشاهدات متجرك الأسبوعي';
    const body =
      totalDelta === 1
        ? 'حصل متجرك على مشاهدة جديدة هذا الأسبوع'
        : `حصل متجرك على ${totalDelta} مشاهدة جديدة هذا الأسبوع`;

    try {
      void pushService
        .notifyUser(userId, {
          title,
          body,
          url: '/my-store/analytics',
          tag: 'weekly-store-views-report',
        })
        .catch(() => {});

      await prisma.notification.create({
        data: {
          userId,
          type: 'WEEKLY_STORE_VIEWS_REPORT',
          title,
          body,
          data: { totalDelta, storeId },
        },
      });
      await advanceBaseline([storeId]);
      sent += 1;
    } catch (err) {
      logger.error('[weeklyStoreViewsReport] failed to send report', {
        err,
        userId,
      });
    }
  }

  logger.info(`[weeklyStoreViewsReport] sent ${sent}/${deltas.length} report(s)`);
}

main()
  .catch(err => {
    logger.error('[weeklyStoreViewsReport] run failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
