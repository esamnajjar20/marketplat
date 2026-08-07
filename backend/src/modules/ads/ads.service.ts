import { adsRepository, AdWithAuthor, AdListRow } from './ads.repository';
import { CreateAdInput, UpdateAdInput, GetAdsQuery, GetMyAdsQuery } from './ads.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { ROLES } from '../../shared/constants/roles';
import { uploadImage, deleteImage } from '../../config/cloudinary';
import { extractCloudinaryPublicId, cleanupUploadedImages } from '../../shared/utils/cloudinaryHelpers';
import { viewsBuffer } from '../../shared/utils/viewsBuffer';
import { withAdImagesLock, withUserAdCreationLock } from '../../shared/utils/adLock';
import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';
import { env } from '../../config/env';
import { AdStatus } from '@prisma/client';
import { sellersRepository } from '../sellers/sellers.repository';
import { sellersService } from '../sellers/sellers.service';
import { favoritesRepository } from '../favorites/favorites.repository';
import { notificationEvents } from '../notifications';
import { savedSearchEvents } from '../saved-searches';
import { activityService, activityTemplates } from '../activity';
import { prisma } from '../../config/prisma';

/**
 * FIX AUDIT-V4-06: GET /ads previously hit Postgres on every single
 * request with no caching layer at all (unlike /categories, which
 * already had a Redis cache-aside pattern). Adds the same kind of
 * caching here, with two adaptations specific to ads:
 *
 * 1. The list is heavily filtered/paginated/sorted, so there's no
 *    single cache key like categories:all — the key is derived from
 *    the actual query params.
 * 2. Ads change far more often than categories (new ads, sold, edited,
 *    images added/removed), so instead of deleting every possible
 *    filtered cache key on every mutation (which would require an
 *    expensive Redis SCAN to even find them), a version number is
 *    bumped on every mutation and baked into the cache key itself.
 *    Old-version keys simply age out via their own short TTL rather
 *    than being actively deleted — cheap, correct, and self-healing
 *    even if a mutation's invalidation call itself fails.
 */
const ADS_CACHE_VERSION_KEY = 'ads:cache_version';
const ADS_LIST_TTL = 30; // seconds — short, since ads change frequently

async function getAdsCacheVersion(): Promise<number> {
  try {
    const v = await redis.get(ADS_CACHE_VERSION_KEY);
    return v ? parseInt(v, 10) : 0;
  } catch {
    return 0; // cache miss on the version itself just means key "v0" — harmless
  }
}

// BUGFIX (found during a post-implementation code audit): exported —
// previously module-private, only ever called from within this file's
// own createAd/updateAd/deleteAd/addImages/removeImage. admin.service.ts's
// forceDeleteAd/setAdFeatured/setAdPinned mutate the exact same `Ad` rows
// this cache is built from, but never invalidated it — an admin
// force-deleting an ad for a genuinely urgent reason (fraud, policy
// violation, a legal takedown request) could still see that ad served
// from the GET /ads list cache to other users for up to its full 30s
// TTL, directly undermining the "urgent" part of an urgent removal.
// Exporting this one function (rather than duplicating the same
// redis.incr(ADS_CACHE_VERSION_KEY) logic in admin.service.ts, which
// would reintroduce the exact kind of silently-divergible duplicate
// this audit already found and removed once — see tokenStore.ts's
// getBlacklistKey) keeps a single source of truth for how this cache is
// invalidated, regardless of which module ends up mutating an ad.
export async function bumpAdsCacheVersion(): Promise<void> {
  try {
    await redis.incr(ADS_CACHE_VERSION_KEY);
  } catch {
    // If this fails, old cached pages simply live out their 30s TTL —
    // worst case is briefly stale list data, not incorrect data.
    logger.warn('Failed to bump ads cache version — stale reads possible for up to 30s');
  }
}

function buildAdsListCacheKey(version: number, query: GetAdsQuery): string {
  // Stable key regardless of object key insertion order.
  const sorted = Object.keys(query).sort().map(k => `${k}=${(query as any)[k]}`).join('&');
  return `ads:list:v${version}:${sorted}`;
}

export const adsService = {
  createAd: async (
    userId: string,
    input: CreateAdInput,
    files: Express.Multer.File[]
  ): Promise<AdWithAuthor> => {
    // AUDIT-FIX M-02: countActiveByUserId() then create() with nothing
    // in between was a TOCTOU race — two concurrent createAd calls for
    // the same user could both read a count one under env.ads.maxPerUser
    // and both pass the check before either had committed its insert,
    // letting a user exceed the cap by up to N-1 ads for N concurrent
    // requests. This is the exact same class of bug FIX D-10 already
    // fixed for addImages (see adLock.ts) — same fix here, applied to
    // ad *creation* instead of ad *images*, via a lock scoped to the
    // user rather than to a single ad (there's no ad yet to lock).
    //
    // FIX AUDIT-V5-01's original intent — don't burn Cloudinary uploads
    // on a request that's going to be rejected anyway — is preserved by
    // doing an unlocked pre-check here (cheap, no lock contention with
    // other requests) before the slow uploads. This pre-check can still
    // race and pass when the cap is actually full; that's fine, because
    // the authoritative check happens again below, inside the lock,
    // immediately before the insert — that second check is the one
    // that actually closes the race, and it's what a client relying on
    // correctness (rather than just the fast-fail optimization) should
    // expect to be enforced.
    // Ad creation is seller-only: ensureSellerProfileForAdCreation throws
    // a BadRequestError if the user has no SellerProfile yet, and a
    // ForbiddenError if their SellerProfile is suspended — both before
    // any Cloudinary upload happens, so a request that's going to be
    // rejected anyway doesn't burn upload cost. sellerProfile is always
    // defined past this point, so the later tx.ad.create's
    // sellerProfileId: sellerProfile.id is never null for a newly
    // created ad.
    const sellerProfile = await sellersService.ensureSellerProfileForAdCreation(userId);

    const preCheckCount = await adsRepository.countActiveByUserId(userId);
    if (preCheckCount >= env.ads.maxPerUser) {
      throw new BadRequestError(
        `You have reached the maximum number of active ads (${env.ads.maxPerUser}). Please delete or mark an old ad as sold to add a new one.`,
        'AD_LIMIT_REACHED',
        { maxPerUser: env.ads.maxPerUser },
      );
    }

    // P-01: parallel uploads — 10x faster than sequential for loop
    const uploads = await Promise.all(files.map(file => uploadImage(file.buffer, 'ads')));
    try {
      // Authoritative check-and-insert, serialized per-user so no two
      // concurrent createAd calls for the same user can both pass the
      // count check before either has committed its insert.
      const ad = await withUserAdCreationLock(userId, async () => {
        const activeCount = await adsRepository.countActiveByUserId(userId);
        if (activeCount >= env.ads.maxPerUser) {
          throw new BadRequestError(
            `You have reached the maximum number of active ads (${env.ads.maxPerUser}). Please delete or mark an old ad as sold to add a new one.`,
            'AD_LIMIT_REACHED',
            { maxPerUser: env.ads.maxPerUser },
          );
        }
        // NEW: ad insert + SellerProfile stats increment happen in one
        // transaction — either both commit or neither does, so
        // totalAds/activeAds can never drift from the actual ad count
        // (seller-profile-design.md §15).
        return prisma.$transaction(async tx => {
          const created = await tx.ad.create({
            data: {
              ...input,
              userId,
              images: uploads.map(upload => upload.url),
              sellerProfileId: sellerProfile.id,
            },
            include: {
              user: { select: { id: true, name: true, city: true, avatarUrl: true } },
              category: { select: { id: true, name: true, nameAr: true } },
            },
          });
          await sellersRepository.incrementStatsOnAdCreated(tx, sellerProfile.id);
          return created;
        });
      });
      // FIX AUDIT-V4-06: invalidate cached listings — a newly created
      // active ad must appear in /ads results immediately, not after
      // up to 30s of TTL expiry.
      await bumpAdsCacheVersion();

      // Notify saved-search owners whose criteria match this new ad.
      // Fire-and-forget, same contract as onFavoritedAdPriceChanged
      // above (and conversations.service.ts's onNewMessage): a
      // notification failure must never fail ad creation itself, so
      // this runs after the transaction has already committed and is
      // not awaited inline with it.
      savedSearchEvents.onAdCreated(ad).catch((err) =>
        logger.error('Failed to process saved-search matches for new ad', { err, adId: ad.id })
      );

      // Gap #10: personal activity timeline entry. Fire-and-forget per
      // activityService.record()'s own contract — never awaited here,
      // so a failed activity insert can never fail an otherwise-
      // successful ad creation.
      activityService.record({ userId, ...activityTemplates.adCreated(ad.id, ad.title) });

      return ad;
    } catch (error) {
      await cleanupUploadedImages(uploads.map(upload => upload.publicId));
      throw error;
    }
  },

  getAds: async (query: GetAdsQuery): Promise<PaginatedResult<AdListRow>> => {
    const page = query.page || 1;
    const limit = query.limit || 20;

    // FIX AUDIT-V4-06: cache-aside read. Cache failures (Redis down,
    // parse error) fall through to the DB silently — caching is
    // strictly a performance optimization here, never a correctness
    // dependency.
    const version = await getAdsCacheVersion();
    const cacheKey = buildAdsListCacheKey(version, query);

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as PaginatedResult<AdListRow>;
    } catch {
      logger.warn('Ads list cache read failed, falling back to DB');
    }

    const { ads, total } = await adsRepository.findMany(query);
    const result = { items: ads, meta: buildPaginationMeta(total, page, limit) };

    try {
      await redis.setex(cacheKey, ADS_LIST_TTL, JSON.stringify(result));
    } catch {
      // Fail silently — DB result is still returned
    }

    return result;
  },

  getAdById: async (id: string, viewerIp?: string): Promise<AdWithAuthor> => {
    const ad = await adsRepository.findById(id);
    if (!ad || ad.status === 'DELETED') throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');

    // P-06: buffered view counting — deduped per IP, flushed to DB every 60s
    // Prevents N DB writes per N pageviews; Redis absorbs the burst
    if (viewerIp) {
      await viewsBuffer.increment(id, viewerIp);
    }

    return ad;
  },

  getMyAds: async (userId: string, query: GetMyAdsQuery): Promise<PaginatedResult<AdListRow>> => {
    const page = query.page || 1;
    const limit = query.limit || 20;
    // FIX D-24: query.status (validated by getMyAdsSchema, scoped to
    // this user's own ads via userId in findManyByUserId's WHERE clause)
    // is now passed through to the repository instead of being dropped —
    // previously findManyByUserId only ever accepted an internal
    // 'ACTIVE'-only statusFilter, never a user-supplied value.
    const { ads, total } = await adsRepository.findManyByUserId(userId, {
      ...query,
      statusFilter: query.status,
    });
    return { items: ads, meta: buildPaginationMeta(total, page, limit) };
  },

  getRelatedAds: async (adId: string): Promise<AdListRow[]> => {
    const ad = await adsRepository.findById(adId);
    if (!ad || ad.status === 'DELETED') throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
    return adsRepository.findRelated(adId, ad.categoryId, ad.city);
  },

  // A-01: public profile ads — only ACTIVE, total matches items count (no S-05 leak)
  getUserAdsForProfile: async (
    userId: string,
    query: { page?: number; limit?: number }
  ): Promise<{ ads: AdListRow[]; total: number }> => {
    return adsRepository.findManyByUserId(userId, {
      page: query.page,
      limit: query.limit,
      statusFilter: 'ACTIVE',
    });
  },

  // A-01: facade for cross-module use — returns ad without side effects (no view increment)
  // Use this instead of importing adsRepository directly from other modules
  findAdForReference: async (
    adId: string
  ): Promise<import('./ads.repository').AdWithAuthor | null> => {
    const ad = await adsRepository.findById(adId);
    if (!ad || ad.status === 'DELETED') return null;
    return ad;
  },

  updateAd: async (
    adId: string,
    userId: string,
    userRole: string,
    input: UpdateAdInput
  ): Promise<AdWithAuthor> => {
    const ad = await adsRepository.findById(adId);
    if (!ad || ad.status === 'DELETED') throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
    if (ad.userId !== userId && userRole !== ROLES.ADMIN) {
      throw new ForbiddenError('You do not have permission to update this ad', 'NOT_YOUR_AD');
    }
    if (input.status && userRole !== ROLES.ADMIN && input.status !== AdStatus.SOLD) {
      throw new ForbiddenError('You cannot set this ad status', 'CANNOT_SET_AD_STATUS');
    }

    // NEW: transitioning ACTIVE -> SOLD is the one ad-status change that
    // also moves a SellerProfile stat (activeAds down, totalSales up —
    // see sellers.repository.ts's decrementActiveAdsOnSold). Only fires
    // on that specific transition, not on every update, and not more
    // than once per ad (guarded by ad.status !== SOLD already, since
    // findById above would have returned the pre-update status).
    const justSold =
      input.status === AdStatus.SOLD && ad.status !== AdStatus.SOLD && ad.sellerProfileId;

    const updated = justSold
      ? await prisma.$transaction(async tx => {
          const result = await tx.ad.update({
            where: { id: adId },
            data: input,
            include: {
              user: { select: { id: true, name: true, city: true, avatarUrl: true } },
              category: { select: { id: true, name: true, nameAr: true } },
            },
          });
          await sellersRepository.decrementActiveAdsOnSold(tx, ad.sellerProfileId as string);
          return result;
        })
      : await adsRepository.update(adId, input);

    // Epic 6: notify everyone who favorited this ad when its price
    // actually changes. Guarded on input.price being explicitly present
    // AND numerically different from the pre-update value (ad.price,
    // captured above before the write, is a Prisma Decimal) — a PATCH
    // that touches other fields but not price must not fire this.
    // Number(...) rather than a string compare: Decimal's string form
    // can carry trailing zeros ("150.50") that would falsely differ
    // from the coerced input number (150.5). Fire-and-forget: never let
    // a notification failure roll back or fail an otherwise-successful
    // ad update, same contract as conversations.service.ts's
    // onNewMessage call.
    if (input.price !== undefined && Number(input.price) !== Number(ad.price)) {
      favoritesRepository
        .findUserIdsByAdId(adId)
        .then((userIds) => notificationEvents.onFavoritedAdPriceChanged(userIds, adId, updated.title))
        .catch((err) =>
          logger.error('Failed to create FAV_AD_PRICE_CHANGED notifications', { err, adId })
        );
    }

    // FIX AUDIT-V4-06: covers both field edits and status changes
    // (e.g. mark-as-sold) — a sold ad must stop appearing as available
    // in cached /ads results immediately, not after up to 30s.
    await bumpAdsCacheVersion();

    // Gap #10: fire-and-forget, see createAd's own comment above for
    // the contract this relies on.
    activityService.record({ userId, ...activityTemplates.adUpdated(adId, updated.title) });

    return updated;
  },

  addImages: async (
    adId: string,
    userId: string,
    userRole: string,
    files: Express.Multer.File[]
  ): Promise<AdWithAuthor> => {
    const ad = await adsRepository.findById(adId);
    if (!ad || ad.status === 'DELETED') throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
    if (ad.userId !== userId && userRole !== ROLES.ADMIN) {
      throw new ForbiddenError('You do not have permission to update this ad', 'NOT_YOUR_AD');
    }
    if (ad.images.length + files.length > 10) {
      throw new BadRequestError('An ad can have a maximum of 10 images');
    }

    // FIX D-10: serialize concurrent addImages/removeImage calls for the
    // same ad. Without this, two concurrent requests can both read the
    // same (stale) image count above, both pass the <=10 check, both
    // upload to Cloudinary, and both write — bypassing the cap and
    // leaving the truncated images as orphaned Cloudinary assets, since
    // cleanupUploadedImages only runs on a thrown error, not on a
    // "succeeded but silently truncated by the DB-level LIMIT" outcome.
    return withAdImagesLock(adId, async () => {
      // Re-check with a fresh read now that we hold the lock — the
      // pre-lock check above is just a fast-fail for the common case;
      // this is the authoritative check.
      const freshAd = await adsRepository.findById(adId);
      if (!freshAd || freshAd.status === 'DELETED') throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
      if (freshAd.images.length + files.length > 10) {
        throw new BadRequestError('An ad can have a maximum of 10 images');
      }

      // P-01: parallel uploads
      const uploads = await Promise.all(files.map(file => uploadImage(file.buffer, 'ads')));
      try {
        const updated = await adsRepository.addImages(
          adId,
          uploads.map(upload => upload.url)
        );
        // FIX AUDIT-V4-06: cached listing payloads include `images` —
        // without this, a newly added photo wouldn't show up in /ads
        // results for up to 30s.
        await bumpAdsCacheVersion();
        return updated;
      } catch (error) {
        await cleanupUploadedImages(uploads.map(upload => upload.publicId));
        throw error;
      }
    });
  },

  removeImage: async (
    adId: string,
    userId: string,
    userRole: string,
    imageUrl: string
  ): Promise<AdWithAuthor> => {
    const ad = await adsRepository.findById(adId);
    if (!ad || ad.status === 'DELETED') throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
    if (ad.userId !== userId && userRole !== ROLES.ADMIN) {
      throw new ForbiddenError('You do not have permission to update this ad', 'NOT_YOUR_AD');
    }
    if (!ad.images.includes(imageUrl)) throw new BadRequestError('Image not found in this ad');

    // EPIC 1.5: ad creation enforces "at least 1 image" (see the
    // createAd schema's images.min(1)), but that rule was never
    // re-checked here — a seller could delete an ad's last remaining
    // image via this endpoint and leave a live ACTIVE ad with zero
    // images, since PATCH /:id doesn't touch images at all (images are
    // only ever added/removed through the two dedicated endpoints
    // below). Blocking the delete up front, before touching Cloudinary
    // or the lock, means a rejected request costs nothing.
    if (ad.images.length <= 1) {
      throw new BadRequestError(
        'Cannot remove the last image — an ad must have at least one image. Add a replacement image first.',
        'MIN_IMAGES_REQUIRED'
      );
    }

    // FIX D-10: same lock as addImages — keeps add/remove for one ad
    // from interleaving in a way that could resurrect a just-removed
    // image or miscount against the 10-image cap.
    return withAdImagesLock(adId, async () => {
      try {
        const publicId = extractCloudinaryPublicId(imageUrl);
        if (publicId) await deleteImage(publicId);
      } catch (err) {
        // AUDIT-FIX 2.4: same fix as products.service.ts/
        // service-listings.service.ts's mirrored removeImage — continuing
        // is correct (removing the image from the ad record must not
        // fail over a storage cleanup miss), but this must be logged so
        // an orphaned Cloudinary asset is discoverable later instead of
        // vanishing with no trace.
        logger.warn('Failed to delete ad image from Cloudinary — orphaned asset', {
          adId,
          imageUrl,
          err,
        });
      }
      const updated = await adsRepository.removeImage(adId, imageUrl);
      // FIX AUDIT-V4-06: same reasoning as addImages — keep cached
      // listing payloads from showing a just-removed image.
      await bumpAdsCacheVersion();
      return updated;
    });
  },

  // Gap #11: mirrors entityImageOperations.ts's reorderImages (used by
  // products/service-listings) — ads carries its own hand-rolled
  // addImages/removeImage (see entityImageOperations.ts's doc comment
  // for why ads was left out of that extraction), so this is
  // implemented the same way, inline, rather than partially adopting
  // the shared factory for just this one operation.
  reorderImages: async (
    adId: string,
    userId: string,
    userRole: string,
    orderedImages: string[]
  ): Promise<AdWithAuthor> => {
    const ad = await adsRepository.findById(adId);
    if (!ad || ad.status === 'DELETED') throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
    if (ad.userId !== userId && userRole !== ROLES.ADMIN) {
      throw new ForbiddenError('You do not have permission to update this ad', 'NOT_YOUR_AD');
    }

    const currentSorted = [...ad.images].sort();
    const proposedSorted = [...orderedImages].sort();
    const isSamePermutation =
      currentSorted.length === proposedSorted.length &&
      currentSorted.every((url, i) => url === proposedSorted[i]);
    if (!isSamePermutation) {
      throw new BadRequestError(
        'The submitted image list must contain exactly the ad\'s current images, reordered.',
        'IMAGES_MISMATCH'
      );
    }

    // No-op guard, same as entityImageOperations.ts's reorderImages.
    if (ad.images.every((url, i) => url === orderedImages[i])) {
      return ad;
    }

    return withAdImagesLock(adId, async () => {
      const freshAd = await adsRepository.findById(adId);
      if (!freshAd || freshAd.status === 'DELETED') throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
      const freshSorted = [...freshAd.images].sort();
      const stillSamePermutation =
        freshSorted.length === proposedSorted.length &&
        freshSorted.every((url, i) => url === proposedSorted[i]);
      if (!stillSamePermutation) {
        throw new BadRequestError(
          'The submitted image list must contain exactly the ad\'s current images, reordered.',
          'IMAGES_MISMATCH'
        );
      }
      const updated = await adsRepository.reorderImages(adId, orderedImages);
      // FIX AUDIT-V4-06 pattern: keep cached listing payloads (which
      // include `images`) from showing the pre-reorder order for up to
      // 30s.
      await bumpAdsCacheVersion();
      return updated;
    });
  },

  deleteAd: async (adId: string, userId: string, userRole: string): Promise<void> => {
    const ad = await adsRepository.findById(adId);
    if (!ad || ad.status === 'DELETED') throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
    if (ad.userId !== userId && userRole !== ROLES.ADMIN) {
      throw new ForbiddenError('You do not have permission to delete this ad', 'NOT_YOUR_AD');
    }
    await adsRepository.softDelete(adId);
    // FIX AUDIT-V4-06: a deleted ad must stop appearing in /ads results
    // immediately, not after up to 30s of cache TTL.
    await bumpAdsCacheVersion();

    // Gap #10: fire-and-forget, see createAd's own comment above for
    // the contract this relies on. Logged for `userId` (the acting
    // caller) even when an admin deletes someone else's ad — see this
    // function's own ownership check above (ad.userId !== userId &&
    // userRole !== ADMIN) — so an admin-performed deletion shows up on
    // the admin's own timeline, not silently on the ad owner's.
    activityService.record({ userId, ...activityTemplates.adDeleted(adId, ad.title) });
  },
};
