/**
 * AD-LIFECYCLE-01
 *
 * Daily/hourly idempotent sweep for the 60-day ad lifecycle.
 * - Sends one warning roughly 7 days before expiry.
 * - Transitions due ACTIVE ads to EXPIRED atomically.
 * - Sends one seller notification after the transition.
 *
 * The public repositories only return ACTIVE + flaggedForReview=false ads,
 * so EXPIRED rows disappear naturally from public discovery without a second
 * visibility mechanism.
 */
import { AdStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { notificationEvents } from '../modules/notifications/notifications.service';

const WARNING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const now = new Date();
  const warningCutoff = new Date(now.getTime() + WARNING_WINDOW_MS);

  const warningAds = await prisma.ad.findMany({
    where: {
      status: AdStatus.ACTIVE,
      flaggedForReview: false,
      expiresAt: { gt: now, lte: warningCutoff },
      expirationNotifiedAt: null,
    },
    select: { id: true, title: true, userId: true, expiresAt: true },
    take: 500,
  });

  for (const ad of warningAds) {
    if (!ad.expiresAt) continue;
    try {
      await notificationEvents.onAdExpiringSoon(ad.userId, ad.id, ad.title, ad.expiresAt);
      await prisma.ad.updateMany({
        where: { id: ad.id, expirationNotifiedAt: null, status: AdStatus.ACTIVE },
        data: { expirationNotifiedAt: now },
      });
    } catch (error) {
      console.error(`[expire-ads] warning failed for ${ad.id}:`, error);
    }
  }

  const dueAds = await prisma.ad.findMany({
    where: { status: AdStatus.ACTIVE, expiresAt: { lte: now } },
    select: { id: true, title: true, userId: true },
    take: 500,
  });

  let expired = 0;
  for (const ad of dueAds) {
    const result = await prisma.ad.updateMany({
      where: { id: ad.id, status: AdStatus.ACTIVE },
      data: { status: AdStatus.EXPIRED },
    });
    if (result.count !== 1) continue;
    expired += 1;
    try {
      await notificationEvents.onAdExpired(ad.userId, ad.id, ad.title);
    } catch (error) {
      console.error(`[expire-ads] notification failed for ${ad.id}:`, error);
    }
  }

  console.log(`[expire-ads] warned=${warningAds.length} expired=${expired}`);
}

main().catch((error) => {
  console.error('[expire-ads] failed:', error);
  process.exitCode = 1;
});
