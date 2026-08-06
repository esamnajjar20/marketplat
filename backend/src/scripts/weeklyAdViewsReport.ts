/**
 * Weekly ad-views-report job — closes the audit report's finding:
 * WEEKLY_AD_VIEWS_REPORT existed as a NotificationType enum value and
 * a live, user-toggleable preference ("مشاهدات الإعلان" in
 * NotificationSettingsForm.tsx) with zero producer anywhere in the
 * codebase — the toggle had no effect no matter how a user set it.
 * FAV_AD_PRICE_CHANGED, SAVED_SEARCH_MATCH and STORE_NEW_PRODUCT are
 * all wired to real events (see notifications.service.ts's
 * notificationEvents); this is the missing counterpart for
 * WEEKLY_AD_VIEWS_REPORT, which — unlike those three — isn't triggered
 * by a single event but by the passage of a week, so it runs as a
 * standalone scheduled script rather than an in-request event hook,
 * the same category as seedE2E.ts/smokeTest.ts in this folder.
 *
 * NOT run automatically by the app process — server.ts's own
 * viewsBuffer flush timer handles the *live* Redis→Postgres view-count
 * sync every 60s, which is a different job from this one. This script
 * must be invoked by an external scheduler (cron/PM2/CI), e.g.:
 *   0 8 * * 1  cd /app && npm run report:weekly-ad-views >> /var/log/weekly-ad-views.log 2>&1
 * (Monday 8am server time — adjust to taste; nothing here assumes a
 * particular day/time, only that it runs roughly once a week.)
 *
 * What it does, per run:
 *   1. Finds every ACTIVE ad with unreported views (views > viewsAtLastReport).
 *   2. Sums that delta per ad owner, but only for owners who opted in
 *      via notificationPreferences.adViews (checked with the same
 *      jsonb ->> operator users.repository.ts already uses for this
 *      column — see updateNotificationPreferences).
 *   3. Writes one WEEKLY_AD_VIEWS_REPORT notification per owner (skips
 *      owners whose delta is 0 — nothing to report, no need to notify
 *      "your ads got 0 views this week" every single week).
 *   4. Advances viewsAtLastReport := views for every ad that had a
 *      nonzero delta, so next run's delta starts clean instead of
 *      re-reporting the same views again.
 *
 * Idempotent by design against re-runs on the same data: an ad with no
 * new views since the last run contributes 0 and is skipped; running
 * twice in a row with no view growth in between sends nothing the
 * second time.
 *
 * Usage:
 *   npm run build && npm run report:weekly-ad-views
 * (mirrors seedE2E.ts's build-then-run convention — see that script's
 * own doc comment for why these standalone jobs aren't run via ts-node
 * in production.)
 */
import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import { pushService } from '../shared/utils/pushService';

const prisma = new PrismaClient();

interface OwnerDelta {
  userId: string;
  totalDelta: number;
  adIds: string[];
}

/**
 * Raw SQL rather than Prisma's query builder for two reasons this
 * project already establishes elsewhere (see users.repository.ts's
 * updateNotificationPreferences): (1) filtering on a jsonb field's
 * ->> value isn't expressible through Prisma's typed where-clauses,
 * and (2) doing the SUM/GROUP BY in Postgres avoids pulling every
 * individual ad row into Node just to aggregate it in memory, which
 * would not scale past a small dev dataset.
 */
async function findOwnerDeltas(): Promise<OwnerDelta[]> {
  const rows = await prisma.$queryRaw<
    { userId: string; totalDelta: bigint; adIds: string[] }[]
  >`
    SELECT
      a."userId" AS "userId",
      SUM(a."views" - a."viewsAtLastReport") AS "totalDelta",
      ARRAY_AGG(a."id") AS "adIds"
    FROM "ads" a
    INNER JOIN "users" u ON u."id" = a."userId"
    WHERE a."status" = 'ACTIVE'
      AND a."views" > a."viewsAtLastReport"
      AND (u."notificationPreferences" ->> 'adViews') = 'true'
    GROUP BY a."userId"
    HAVING SUM(a."views" - a."viewsAtLastReport") > 0
  `;

  return rows.map((r) => ({
    userId: r.userId,
    totalDelta: Number(r.totalDelta),
    adIds: r.adIds,
  }));
}

/** Advances the baseline for every ad that contributed to a sent
 * report, so next run's delta doesn't double-count these views.
 * Scoped to the exact ad ids just reported (not "all of this user's
 * ads") so an ad created/gaining views after this run started isn't
 * silently marked as already-reported. */
async function advanceBaseline(adIds: string[]): Promise<void> {
  if (adIds.length === 0) return;
  await prisma.$executeRaw`
    UPDATE "ads"
    SET "viewsAtLastReport" = "views"
    WHERE "id" = ANY(${adIds})
  `;
}

async function main(): Promise<void> {
  const deltas = await findOwnerDeltas();

  if (deltas.length === 0) {
    logger.info('[weeklyAdViewsReport] nothing to report — no opted-in owner has new views');
    return;
  }

  let sent = 0;
  for (const { userId, totalDelta, adIds } of deltas) {
    const title = 'تقرير مشاهدات إعلاناتك الأسبوعي';
    const body =
      totalDelta === 1
        ? 'حصل إعلانك على مشاهدة جديدة هذا الأسبوع'
        : `حصلت إعلاناتك على ${totalDelta} مشاهدة جديدة هذا الأسبوع`;

    try {
      // Same fire-and-forget-push-alongside-in-app-write convention as
      // notificationEvents in notifications.service.ts — a push failing
      // to send must never block or fail the in-app notification write.
      void pushService.notifyUser(userId, { title, body, url: '/dashboard', tag: 'weekly-ad-views-report' });

      await prisma.notification.create({
        data: {
          userId,
          type: 'WEEKLY_AD_VIEWS_REPORT',
          title,
          body,
          data: { totalDelta, adCount: adIds.length },
        },
      });
      await advanceBaseline(adIds);
      sent += 1;
    } catch (err) {
      // One owner's failure must not abort the whole run — the rest of
      // the batch still gets its report, and this owner's un-advanced
      // baseline means their unreported views simply roll into next
      // week's delta instead of being lost.
      logger.error('[weeklyAdViewsReport] failed to send report', { err, userId });
    }
  }

  logger.info(`[weeklyAdViewsReport] sent ${sent}/${deltas.length} report(s)`);
}

main()
  .catch((err) => {
    logger.error('[weeklyAdViewsReport] run failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // Explicit exit rather than relying on exitCode + natural event-loop
    // drain: this is a scheduled/cron-invoked script, and if anything
    // (an open handle, a pending timer) keeps the loop alive, the
    // external scheduler would see it hang instead of finishing with
    // the exit code it needs to detect failure.
    process.exit(process.exitCode ?? 0);
  });
