/**
 * Promotion lifecycle notifications — PROMO-1 (of the
 * promotions design doc, deferred at MVP time: "هذه ليست ضرورية في
 * MVP"). Closes two things in one run:
 *
 *   1. The status-transition sweep promotions.service.ts's resolveStatus
 *      doc comment mentions — SCHEDULED rows whose startsAt has passed
 *      become ACTIVE, ACTIVE rows whose endsAt has passed become
 *      EXPIRED, using promotionsRepository's findDueForActivation/
 *      findDueForExpiry (built when the Promotion module was first
 *      added, unused until this script). Individual reads/writes
 *      already self-correct via resolveStatus regardless of whether
 *      this script has run recently — this sweep keeps the *stored*
 *      status column itself accurate for anything that queries it
 *      directly (e.g. products.repository.ts's hasPromotion filter),
 *      not just anything that goes through promotionsService.
 *
 *   2. Three lifecycle notifications to the store owner (NOT
 *      buyers/favoriters — there is no favoriting mechanism for
 *      Promotion, only for Ad):
 *        - started:  a SCHEDULED promotion just became ACTIVE
 *        - expiring: an ACTIVE promotion's endsAt is within
 *                     EXPIRY_WARNING_HOURS and hasn't been warned about
 *                     yet (Promotion.expiryWarnedAt IS NULL)
 *        - expired:  an ACTIVE promotion just became EXPIRED
 *      All three use NotificationType PROMOTION_STATUS_CHANGE — see
 *      that enum value's schema.prisma doc for why it's distinct from
 *      the existing PROMOTION type (admin broadcast newsletter, wrong
 *      audience/trigger for this). Gated by the same
 *      notificationPreferences jsonb ->> pattern
 *      weeklyAdViewsReport.ts already established for adViews, under a
 *      new `myPromotions` key (users.validation.ts).
 *
 * NOT run automatically by the app process — same as
 * weeklyAdViewsReport.ts, must be invoked by an external scheduler:
 *   every 15 minutes: cd /app && npm run report:promotion-lifecycle >> /var/log/promotion-lifecycle.log 2>&1
 * (every 15 minutes — unlike the weekly report, "started"/"expired"
 * notifications are time-sensitive enough that a once-a-week cadence
 * would make them arrive hours or days late; nothing here assumes a
 * particular interval beyond "frequently enough that a promotion
 * starting/expiring is noticed reasonably soon after it happens.")
 *
 * Idempotent by design against re-runs:
 *   - started/expired: only rows returned by findDueForActivation/
 *     findDueForExpiry are processed, and each row's status is
 *     advanced to ACTIVE/EXPIRED as part of the same iteration — a
 *     row already ACTIVE or EXPIRED is never returned by those queries
 *     again, so it can't be double-notified.
 *   - expiring: gated on expiryWarnedAt IS NULL and set immediately
 *     after a successful notification — a row already warned is
 *     excluded from findExpiringSoon on the next run regardless of how
 *     many times the script runs before endsAt actually arrives.
 *
 * Usage:
 *   npm run build && npm run report:promotion-lifecycle
 * (mirrors weeklyAdViewsReport.ts's build-then-run convention.)
 */
import { PrismaClient, Promotion } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import { pushService } from '../shared/utils/pushService';

const prisma = new PrismaClient();

const EXPIRY_WARNING_HOURS = 24;

interface OwnerContext {
  userId: string;
  productName: string;
}

/**
 * Same raw-SQL-for-jsonb-and-join reasoning as weeklyAdViewsReport.ts's
 * findOwnerDeltas: notificationPreferences ->> 'myPromotions' isn't
 * expressible through Prisma's typed where-clauses, and this needs to
 * reach through Promotion -> StoreDetails -> SellerProfile -> User in
 * one query rather than N+1 Prisma relation loads per promotion.
 */
async function resolveOwnerContext(promotion: Promotion): Promise<OwnerContext | null> {
  const rows = await prisma.$queryRaw<{ userId: string; productName: string }[]>`
    SELECT u."id" AS "userId", p."name" AS "productName"
    FROM "store_details" sd
    INNER JOIN "seller_profiles" sp ON sp."id" = sd."sellerProfileId"
    INNER JOIN "users" u ON u."id" = sp."userId"
    INNER JOIN "products" p ON p."id" = ${promotion.productId}
    WHERE sd."id" = ${promotion.storeId}
      AND (u."notificationPreferences" ->> 'myPromotions') = 'true'
  `;
  return rows[0] ?? null;
}

// STORE-FOLLOWER-NOTIFICATIONS (Foundation v1): deliberately independent
// of resolveOwnerContext above — that one is filtered to only the
// owner's own `myPromotions` opt-in, but a store follower's interest in
// "this store started a new offer" has nothing to do with whether the
// store *owner* has opted into their own lifecycle notifications, so
// this can't reuse that query's product-name lookup.
async function resolveProductName(productId: string): Promise<string | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { name: true },
  });
  return product?.name ?? null;
}

async function notifyFollowers(promotion: Promotion, productName: string): Promise<void> {
  const followers = await prisma.storeFollower.findMany({
    where: { storeId: promotion.storeId },
    select: { userId: true },
  });
  if (followers.length === 0) return;
  const followerIds = followers.map(f => f.userId);
  const title = 'عرض جديد';
  const body = `عرض جديد على "${productName}": ${promotion.title}`;

  // PUSH-AWAIT-CRON-01: awaited (unlike request-path producers) — this is
  // a short-lived process that calls process.exit() when main() settles,
  // so a fire-and-forget push (and its 1.5s retry) was killed mid-flight.
  // Same push-then-createMany shape as
  // notifications.service.ts's fanOutSameContentNotification — kept
  // inline (raw PrismaClient, no notificationsRepository import) for
  // the same standalone-process reasoning as every other write in this
  // script.
  await pushService
    .notifyUsers(followerIds, {
      title,
      body,
      url: `/stores/${promotion.storeId}`,
      tag: `store-promotion-${promotion.id}`,
      type: 'STORE_PROMOTION_STARTED',
    })
    .catch(() => {});

  await prisma.notification.createMany({
    data: followerIds.map(userId => ({
      userId,
      type: 'STORE_PROMOTION_STARTED',
      title,
      body,
      data: {
        storeId: promotion.storeId,
        promotionId: promotion.id,
        productId: promotion.productId,
      },
    })),
  });
}

async function notify(
  userId: string,
  title: string,
  body: string,
  promotion: Promotion,
  event: 'started' | 'expiring' | 'expired'
): Promise<void> {
  // Fire-and-forget push alongside the in-app write, same convention
  // as every other producer in notifications.service.ts and
  // weeklyAdViewsReport.ts — a push failure must never block or fail
  // the in-app notification.
  await pushService
    .notifyUser(userId, {
      title,
      body,
      url: '/my-store?tab=promotions',
      tag: `promotion-${promotion.id}-${event}`,
      type: 'PROMOTION_STATUS_CHANGE',
    })
    .catch(() => {});

  await prisma.notification.create({
    data: {
      userId,
      type: 'PROMOTION_STATUS_CHANGE',
      title,
      body,
      data: {
        promotionId: promotion.id,
        productId: promotion.productId,
        event,
      },
    },
  });
}

async function processStarted(now: Date): Promise<number> {
  const due = await prisma.promotion.findMany({
    where: { status: 'SCHEDULED', startsAt: { lte: now } },
  });
  let sent = 0;
  for (const promotion of due) {
    try {
      const owner = await resolveOwnerContext(promotion);
      // Status advances regardless of whether the owner is opted in to
      // notifications — the sweep's job (1) is independent of job (2).
      await prisma.promotion.update({
        where: { id: promotion.id },
        data: { status: 'ACTIVE' },
      });
      if (owner) {
        await notify(
          owner.userId,
          'بدأ عرضك',
          `بدأ العرض "${promotion.title}" على "${owner.productName}"`,
          promotion,
          'started'
        );
        sent += 1;
      }
      // STORE-FOLLOWER-NOTIFICATIONS (Foundation v1): fan out to every
      // follower of the store, independent of the owner block above —
      // see resolveProductName's doc comment for why this can't reuse
      // owner.productName (that lookup is gated on the owner's own
      // opt-in, followers' interest isn't).
      const productName = await resolveProductName(promotion.productId);
      if (productName) {
        await notifyFollowers(promotion, productName);
      }
    } catch (err) {
      logger.error('[promotionLifecycle] failed processing started promotion', {
        err,
        promotionId: promotion.id,
      });
    }
  }
  return sent;
}

async function processExpiring(now: Date): Promise<number> {
  const threshold = new Date(now.getTime() + EXPIRY_WARNING_HOURS * 60 * 60 * 1000);
  const due = await prisma.promotion.findMany({
    where: {
      status: 'ACTIVE',
      endsAt: { gt: now, lte: threshold },
      expiryWarnedAt: null,
    },
  });
  let sent = 0;
  for (const promotion of due) {
    try {
      const owner = await resolveOwnerContext(promotion);
      if (owner) {
        await notify(
          owner.userId,
          'عرضك سينتهي قريباً',
          `سينتهي العرض "${promotion.title}" على "${owner.productName}" خلال ${EXPIRY_WARNING_HOURS} ساعة`,
          promotion,
          'expiring'
        );
        sent += 1;
      }
      // Marked regardless of opt-in — an owner who opts in later
      // shouldn't get a stale warning for a window that's already
      // half-elapsed; they'll still get the "expired" notification.
      await prisma.promotion.update({
        where: { id: promotion.id },
        data: { expiryWarnedAt: now },
      });
    } catch (err) {
      logger.error('[promotionLifecycle] failed processing expiring promotion', {
        err,
        promotionId: promotion.id,
      });
    }
  }
  return sent;
}

async function processExpired(now: Date): Promise<number> {
  const due = await prisma.promotion.findMany({
    where: { status: 'ACTIVE', endsAt: { lte: now } },
  });
  let sent = 0;
  for (const promotion of due) {
    try {
      const owner = await resolveOwnerContext(promotion);
      await prisma.promotion.update({
        where: { id: promotion.id },
        data: { status: 'EXPIRED' },
      });
      if (owner) {
        await notify(
          owner.userId,
          'انتهى عرضك',
          `انتهى العرض "${promotion.title}" على "${owner.productName}"`,
          promotion,
          'expired'
        );
        sent += 1;
      }
    } catch (err) {
      logger.error('[promotionLifecycle] failed processing expired promotion', {
        err,
        promotionId: promotion.id,
      });
    }
  }
  return sent;
}

async function main(): Promise<void> {
  const now = new Date();

  const startedSent = await processStarted(now);
  const expiringSent = await processExpiring(now);
  const expiredSent = await processExpired(now);

  logger.info(
    `[promotionLifecycle] started=${startedSent} expiring=${expiringSent} expired=${expiredSent}`
  );
}

main()
  .catch(err => {
    logger.error('[promotionLifecycle] run failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    // Same explicit-exit reasoning as weeklyAdViewsReport.ts — a
    // cron-invoked script needs its exit code observed, not left to a
    // possibly-hanging event loop.
    process.exit(process.exitCode ?? 0);
  });
