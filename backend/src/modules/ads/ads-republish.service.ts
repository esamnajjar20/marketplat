import { reportBackgroundFailure } from '../../shared/utils/backgroundTask';
/**
 * TRACK-REPUBLISH ()
 *
 * POST /ads/:id/republish — owner only.
 * Creates a fresh ACTIVE ad from a SOLD (or soft-DELETED) source ad
 * instead of forcing the seller to re-enter everything.
 *
 * Anti-spam:
 *  - Source must be SOLD or DELETED (not already ACTIVE)
 *  - Max REPUBLISH_PER_DAY per user (default 5)
 *  - Cooldown COOLDOWN_HOURS since last ACTIVE ad created from same title+user
 *    (soft check via recent active ads count)
 *  - Subject to same maxPerUser active-ads cap as createAd
 *  - New ad gets new id, views=0, isFeatured/isPinned=false, risk re-scored
 */
import { AdStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { adsRepository } from './ads.repository';
import { sellersService } from '../sellers/sellers.service';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { withUserAdCreationLock } from '../../shared/utils/adLock';
import { env } from '../../config/env';
import { logger } from '../../shared/utils/logger';
import { bumpAdsCacheVersion } from './ads.service';
import { savedSearchEvents } from '../saved-searches';
import { activityService, activityTemplates } from '../activity';
import { fraudService } from '../fraud';
import { recordFailedTask } from '../../shared/utils/failedBackgroundTasks';

// previous block had conflicting "soft cap"
// comments and an unexplained +3. Kept to a single named value for
// both sides of the check below.
const REPUBLISH_DAILY_CAP = 5;
const COOLDOWN_HOURS = 12;

export const adsRepublishService = {
  republish: async (userId: string, adId: string) => {
    const sellerProfile = await sellersService.ensureSellerProfileForAdCreation(userId);

    const source = await prisma.ad.findUnique({ where: { id: adId } });
    if (!source || source.status === AdStatus.ACTIVE) {
      // Hide existence of others' ads / active ones
      if (!source || source.userId !== userId) {
        throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
      }
      throw new BadRequestError(
        'Only sold or deleted ads can be republished. This ad is still active.',
        'AD_STILL_ACTIVE'
      );
    }
    if (source.userId !== userId) {
      throw new ForbiddenError('You can only republish your own ads.', 'NOT_YOUR_AD');
    }
    if (![AdStatus.SOLD, AdStatus.DELETED, AdStatus.EXPIRED].includes(source.status)) {
      throw new BadRequestError('Ad cannot be republished from this status.', 'AD_NOT_REPUBLISHABLE');
    }
    if (!source.images || source.images.length < 1) {
      throw new BadRequestError('Source ad has no images to copy.', 'AD_NO_IMAGES');
    }

    // single clean set of checks — the
    // previous version had three counters with conflicting comments
    // and an unexplained "+3" on the daily cap. Behaviourally this
    // keeps the same intent:
    //
    //   1. At most one republish per source title per user per 24h
    //      (prevents a seller cycling a sold ad back to ACTIVE every
    //      time it stops appearing at the top of /ads).
    //   2. At most REPUBLISH_DAILY_CAP*2 total creates per 24h (soft
    //      pressure — the authoritative cap is still maxPerUser below).
    //
    // Note the same-title check is still outside the per-user lock —
    // two concurrent republish calls for the same title can both pass
    // it before either commits. That race is bounded by the
    // authoritative maxPerUser check inside the lock below; worst case
    // is two ACTIVE clones instead of one, which the seller can clean
    // up. Moving this into the lock would serialize every republish
    // against every other write for the user, for a check that is
    // purely a UX guardrail rather than a hard limit — deliberate
    // tradeoff, recorded here so a future pass doesn't re-flag it
    // without re-checking that reasoning.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const sameTitleToday = await prisma.ad.count({
      where: {
        userId,
        title: source.title,
        status: AdStatus.ACTIVE,
        createdAt: { gte: dayAgo },
      },
    });
    if (sameTitleToday >= 1) {
      throw new BadRequestError(
        'You already republished an ad with this title in the last 24 hours.',
        'REPUBLISH_COOLDOWN'
      );
    }

    const createdLastDay = await prisma.ad.count({
      where: { userId, createdAt: { gte: dayAgo } },
    });
    if (createdLastDay >= REPUBLISH_DAILY_CAP * 2) {
      throw new BadRequestError(
        'Too many ads created today. Try again tomorrow.',
        'REPUBLISH_DAILY_LIMIT'
      );
    }

    // Cooldown since source was closed (outside lock — pure time check)
    const hoursSinceUpdate =
      (Date.now() - new Date(source.updatedAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceUpdate < COOLDOWN_HOURS && source.status === AdStatus.SOLD) {
      throw new BadRequestError(
        `Please wait ${COOLDOWN_HOURS} hours after marking an ad as sold before republishing.`,
        'REPUBLISH_TOO_SOON'
      );
    }

    // AUDIT-FIX (#4): same race as createAd — count then insert without a
    // lock lets concurrent republish exceed maxPerUser.
    return withUserAdCreationLock(userId, async () => {
      const activeCount = await adsRepository.countActiveByUserId(userId);
      const maxPerUser = env.ads?.maxPerUser ?? 20;
      if (activeCount >= maxPerUser) {
        throw new BadRequestError(
          `You have reached the maximum number of active ads (${maxPerUser}).`,
          'AD_LIMIT_REACHED',
          { maxPerUser }
        );
      }

      const created = await prisma.$transaction(async (tx) => {
        // `ad` is passed to
        // savedSearchEvents.onAdCreated() after the transaction commits
        // — that call site expects the AdWithAuthor shape (user +
        // category included), matching what createAd passes. Without
        // this include the freshly-created row had no user/category
        // relations attached, and TypeScript caught it as a build
        // error the moment the pipeline was wired in.
        const ad = await tx.ad.create({
          data: {
            title: source.title,
            description: source.description,
            price: source.price,
            images: source.images,
            city: source.city,
            latitude: source.latitude,
            longitude: source.longitude,
            condition: source.condition,
            isNegotiable: source.isNegotiable,
            status: AdStatus.ACTIVE,
            expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
            expirationNotifiedAt: null,
            views: 0,
            isFeatured: false,
            isPinned: false,
            pinnedByAdmin: false,
            userId: source.userId,
            categoryId: source.categoryId,
            sellerProfileId: sellerProfile.id,
            storeId: source.storeId,
          },
          include: {
            user: { select: { id: true, name: true, city: true, avatarUrl: true } },
            category: { select: { id: true, name: true, nameAr: true } },
          },
        });
        await tx.sellerProfile.update({
          where: { id: sellerProfile.id },
          data: {
            totalAds: { increment: 1 },
            activeAds: { increment: 1 },
          },
        });
        return ad;
      });

      // createAd runs four
      // post-commit side effects — cache invalidation, fraud scoring,
      // saved-search fan-out, and activity recording. Republish
      // creates an equally-live ad but ran none of them. Most
      // importantly the missing fraud scoring was directly
      // exploitable: a scam ad that got caught and taken down
      // (status=DELETED) could be re-published as a fresh row with no
      // scoring at all, silently bypassing the whole detector for the
      // clone. Cache invalidation was a lesser but visible bug — the
      // just-created ad didn't appear in /ads for up to 30s.
      //
      // All four run after the transaction commits, same contract as
      // createAd: a failure in any of them must never fail the ad
      // that already exists.
      await bumpAdsCacheVersion();

      savedSearchEvents.onAdCreated(created).catch((err) =>
        logger.error('Failed to process saved-search matches for republished ad', {
          err,
          adId: created.id,
        }),
      );

      activityService.record({
        userId,
        ...activityTemplates.adCreated(created.id, created.title),
      });

      fraudService
        .scoreAd({
          id: created.id,
          userId: created.userId,
          title: created.title,
          description: created.description,
          city: created.city,
          price: created.price ? Number(created.price) : null,
          categoryId: created.categoryId,
        })
        .catch((err) => {
          logger.error('Fraud scoring failed to run for republished ad', {
            err,
            adId: created.id,
          });
          recordFailedTask(
            'FRAUD_SCORE_AD',
            {
              adId: created.id,
              userId: created.userId,
              title: created.title,
              description: created.description,
              city: created.city,
              price: created.price ? Number(created.price) : null,
              categoryId: created.categoryId,
            },
            err,
          ).catch((error) => reportBackgroundFailure('backend/src/modules/ads/ads-republish.service.ts', error));
        });

      logger.info('Ad republished', {
        sourceAdId: source.id,
        newAdId: created.id,
        userId,
      });

      return created;
    });
  },
};
