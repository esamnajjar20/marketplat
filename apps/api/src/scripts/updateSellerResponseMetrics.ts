/**
 * Seller response-metrics job — PLAN-P1-2. SellerProfile.responseRate
 * and .responseTimeMinutes have existed in the schema since the
 * seller-profile-design doc, and MySellerProfileCard/seller.types.ts
 * already model and even render them (e.g. ProfileBadges.tsx's own
 * PLAN-P1-1 doc comment), but no code path anywhere ever wrote a
 * value into either column — every seller shows null forever. This
 * script is the missing producer, same standalone-scheduled-script
 * category as weeklyAdViewsReport.ts/myPromotionsExpiring.ts in this
 * folder (a metric that reflects "behavior over a window", not a
 * single event, so it doesn't belong in an in-request hook).
 *
 * NOT run automatically by the app process — must be invoked by an
 * external scheduler, same convention as this folder's other two
 * report scripts:
 *   0 3 * * *  cd /app && npm run report:seller-response-metrics >> /var/log/seller-response-metrics.log 2>&1
 * (once daily is plenty — a response-speed reputation signal has no
 * reason to update more often than that; nothing here assumes a
 * particular time of day).
 *
 * Definition used (documented here because it's a judgment call, not
 * a spec handed down): for each conversation, find the buyer's first
 * message (buyer always initiates — see conversations.service.ts's
 * startFromAd/startFromUser, which both take the caller as buyerId)
 * and, if any, the seller's first message sent after it. That pair is
 * "did this seller respond to this conversation, and how fast."
 *   - responseRate    = replied-to conversations / initiated conversations, as a percentage
 *   - responseTimeMinutes = average minutes from first buyer message to first seller reply,
 *                            across only the conversations that got a reply
 * Deliberately NOT counting every message pair in a thread (a seller's
 * 2nd/3rd reply speed isn't "did they respond to being contacted") and
 * deliberately windowed to RESPONSE_WINDOW_DAYS (see below) rather than
 * lifetime — a seller who was fast a year ago but has gone quiet
 * should not keep showing a stale good number forever; this mirrors
 * why a badge/trust signal like this is usually described as "in the
 * last N days" by every marketplace that ships one.
 *
 * A seller with zero initiated conversations in the window is left
 * untouched (both columns stay whatever they were, typically null) —
 * there's no evidence either way, so nothing here should assert a
 * rate for them.
 *
 * Usage:
 *   npm run build && npm run report:seller-response-metrics
 * (mirrors weeklyAdViewsReport.ts's build-then-run convention.)
 */
import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/utils/logger';

const prisma = new PrismaClient();

const RESPONSE_WINDOW_DAYS = 90;

interface SellerResponseAgg {
  sellerId: string;
  totalInitiated: bigint;
  totalReplied: bigint;
  avgResponseMinutes: number | null;
}

/**
 * Raw SQL (same tradeoff weeklyAdViewsReport.ts's findOwnerDeltas
 * already documents): the "first message per conversation, per side"
 * shape needs DISTINCT ON / window-function logic Prisma's query
 * builder can't express, and doing the aggregation in Postgres avoids
 * pulling every message row for every conversation into Node just to
 * fold them in memory.
 */
async function computeSellerResponseAggregates(): Promise<SellerResponseAgg[]> {
  const windowStart = new Date(Date.now() - RESPONSE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  return prisma.$queryRaw<SellerResponseAgg[]>`
    WITH first_buyer_msg AS (
      SELECT DISTINCT ON (m."conversationId")
        m."conversationId",
        c."sellerId",
        m."createdAt" AS "buyerMsgAt"
      FROM messages m
      INNER JOIN conversations c ON c.id = m."conversationId"
      WHERE m."senderId" = c."buyerId"
        AND m."createdAt" >= ${windowStart}
      ORDER BY m."conversationId", m."createdAt" ASC
    ),
    first_seller_reply AS (
      SELECT DISTINCT ON (fbm."conversationId")
        fbm."conversationId",
        fbm."sellerId",
        fbm."buyerMsgAt",
        m."createdAt" AS "sellerReplyAt"
      FROM first_buyer_msg fbm
      INNER JOIN messages m
        ON m."conversationId" = fbm."conversationId"
        AND m."senderId" = fbm."sellerId"
        AND m."createdAt" > fbm."buyerMsgAt"
      ORDER BY fbm."conversationId", m."createdAt" ASC
    )
    SELECT
      fbm."sellerId" AS "sellerId",
      COUNT(DISTINCT fbm."conversationId") AS "totalInitiated",
      COUNT(DISTINCT fsr."conversationId") AS "totalReplied",
      AVG(EXTRACT(EPOCH FROM (fsr."sellerReplyAt" - fbm."buyerMsgAt")) / 60)::float AS "avgResponseMinutes"
    FROM first_buyer_msg fbm
    LEFT JOIN first_seller_reply fsr ON fsr."conversationId" = fbm."conversationId"
    GROUP BY fbm."sellerId"
  `;
}

async function main(): Promise<void> {
  const aggregates = await computeSellerResponseAggregates();

  if (aggregates.length === 0) {
    logger.info('[updateSellerResponseMetrics] nothing to update — no conversations in window');
    return;
  }

  let updated = 0;
  for (const row of aggregates) {
    const totalInitiated = Number(row.totalInitiated);
    const totalReplied = Number(row.totalReplied);
    if (totalInitiated === 0) continue; // shouldn't happen (GROUP BY guarantees >=1), guard anyway

    const responseRate = (totalReplied / totalInitiated) * 100;
    // Only a real, replied-to average is meaningful — a seller who
    // replied 0/12 times has a defined 0% rate but an undefined speed,
    // not a 0-minute one.
    const responseTimeMinutes =
      totalReplied > 0 && row.avgResponseMinutes !== null
        ? Math.round(row.avgResponseMinutes)
        : null;

    try {
      await prisma.sellerProfile.update({
        where: { userId: row.sellerId },
        data: {
          responseRate,
          responseTimeMinutes,
        },
      });
      updated += 1;
    } catch (err) {
      // A seller row with conversations but no SellerProfile shouldn't
      // exist (ensureSellerProfileForAdCreation gates ad creation on
      // one), but a stale/orphaned conversation from before that gate
      // existed must not abort the whole run.
      logger.error('[updateSellerResponseMetrics] failed to update seller', {
        err,
        sellerId: row.sellerId,
      });
    }
  }

  logger.info(`[updateSellerResponseMetrics] updated ${updated}/${aggregates.length} seller(s)`);
}

main()
  .catch(err => {
    logger.error('[updateSellerResponseMetrics] run failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
