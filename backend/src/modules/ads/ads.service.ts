import { reportBackgroundFailure } from '../../shared/utils/backgroundTask';
import { cachePolicy } from '../../shared/cache/cachePolicy';
import { createHash } from 'crypto';
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
import { swrGet } from '../../shared/utils/swrCache';
import {
  ADS_GEN_HARD_KEY,
  ADS_GEN_SOFT_KEY,
  bumpAdsCacheVersion,
  bumpAdsCacheHard,
  bumpAdsCacheVersionAndHome,
} from './ads.cache.keys';
import { logger } from '../../shared/utils/logger';
import { env } from '../../config/env';
import { AdStatus } from '@prisma/client';
import { sellersRepository } from '../sellers/sellers.repository';
import { sellersService } from '../sellers/sellers.service';
import { requireStoreAccess } from '../stores/store-members.service';
import { favoritesRepository } from '../favorites/favorites.repository';
import { notificationEvents } from '../notifications';
import { savedSearchEvents } from '../saved-searches';
import { activityService, activityTemplates } from '../activity';
import { fraudService } from '../fraud';
import { followsService } from '../follows/follows.service';
import { prisma } from '../../config/prisma';
import { FollowTargetType } from '@prisma/client';
import { MAX_IMAGES_PER_ENTITY } from '../../config/limits';
import { recordFailedTask } from '../../shared/utils/failedBackgroundTasks';

/**
 * FIX AUDIT-V4-06: GET /ads previously hit Postgres on every single request.
 * The list is heavily filtered/paginated/sorted, so the cache key is derived
 * from the actual query params.
 *
 * FIX ADS-CACHE-SWR-01: the cache used to bake a version number into the KEY
 * and bump it on every mutation. That had three costs: (1) every bump dropped
 * ALL list keys at once, so after each edit every distinct query paid a
 * synchronous DB round trip (per-process singleflight only — PM2 workers did
 * not share it); (2) every request did two sequential Redis reads (version,
 * then value); (3) dead versioned keys piled up until their TTL.
 *
 * Now the key is stable and the value is a stale-while-revalidate envelope
 * (see shared/utils/swrCache.ts) stamped with two generation tokens, fetched
 * together with the value in ONE MGET:
 *  - HARD generation: bumped by mutations that must HIDE an ad (delete, sold /
 *    non-ACTIVE, admin takedown). A stamp mismatch makes the entry unusable, so
 *    a removed ad is never served from cache.
 *  - SOFT generation: bumped by everything else (create, edit, images,
 *    featured/pinned). A mismatch serves the previous payload immediately and
 *    refreshes it in the background under a cross-process lock, so a burst of
 *    writes never turns into a burst of synchronous rebuilds.
 * Browsers/CDN already hold these lists for up to 30s + 30s (CACHE.LIVE), so a
 * one-request soft-stale window adds no staleness clients weren't allowed to
 * see already.
 */
const ADS_LIST_POLICY = cachePolicy('publicLive').server;
const ADS_LIST_SOFT_TTL_MS = ADS_LIST_POLICY.softTtlMs;
const ADS_LIST_SOFT_JITTER_MS = ADS_LIST_POLICY.softJitterMs;
// FIX ADS-WARM-TTL-01: raised 120 → 600 so keep-warm (every 240s) can actually
// hold first-page default lists between cycles. Generation invalidation still
// purges on write; SWR serves soft-stale immediately. Safe because only
// unfiltered/default first pages are warmed (see cacheWarmup WARMUP_TASKS).
const ADS_LIST_HARD_TTL_SECONDS = ADS_LIST_POLICY.hardTtlSec;
const ADS_LIST_LOCK_TTL_MS = ADS_LIST_POLICY.lockTtlMs;

// Invalidation helpers live in ads.cache.keys.ts (import-cycle-free); re-exported
// so existing importers of ads.service keep working.
export { bumpAdsCacheVersion, bumpAdsCacheHard, bumpAdsCacheVersionAndHome };

function buildAdsListCacheKey(query: GetAdsQuery): string {
  // Stable key regardless of object key insertion order.
  const sorted = Object.keys(query).sort().map(k => `${k}=${(query as any)[k]}`).join('&');
  // FIX ADS-CACHE-KEY-01: bound the key length (max 200-char `search` + many
  // filters otherwise makes multi-KB Redis keys).
  const body = sorted.length > 120 ? createHash('sha1').update(sorted).digest('hex') : sorted;
  return `ads:list2:${body}`;
}

// FIX ADS-CACHE-POLLUTION-01: free-text searches are near-unique per user;
// caching them fills Redis with one-hit keys (and lets a client flood it
// by varying `search`). Short/common terms are still cached; long ones
// are served from the DB (still singleflighted by the SWR engine).
const ADS_CACHEABLE_SEARCH_MAX = 24;

// TRACK-AD-STORE (phase 2): an ad published under a store is no longer
// manageable only by the exact account that created it — the store
// owner, and any ACTIVE store member whose role carries the manageAds
// capability (MANAGER/EDITOR — see store-members.service.ts's
// ROLE_CAPABILITIES), can also update/delete it and manage its images,
// the same way they can already manage the store's products. A
// personal (non-store) ad is unaffected: it's still manageable only by
// ad.userId (or an admin).
async function canManageAd(
  ad: { userId: string; storeId: string | null },
  userId: string,
  userRole: string
): Promise<boolean> {
  if (userRole === ROLES.ADMIN) return true;
  if (ad.userId === userId) return true;
  if (!ad.storeId) return false;
  try {
    await requireStoreAccess(userId, ad.storeId, 'manageAds');
    return true;
  } catch {
    return false;
  }
}

export const adsService = {
  createAd: async (
    userId: string,
    input: CreateAdInput,
    files: Express.Multer.File[],
    // FIX OFFLINE-IDEMPOTENCY-01: optional client op id from X-Offline-Op-Id
    offlineOperationId?: string | null,
  ): Promise<AdWithAuthor> => {
    // FIX OFFLINE-IDEMPOTENCY-01: if this offline op already created an ad,
    // return it (idempotent replay after flaky ACK / double Background Sync).
    if (offlineOperationId) {
      const existing = await prisma.ad.findUnique({
        where: { offlineOperationId },
        include: {
          user: { select: { id: true, name: true, city: true, avatarUrl: true } },
          category: { select: { id: true, name: true, nameAr: true } },
          store: {
            select: {
              id: true,
              name: true,
              slug: true,
              logoUrl: true,
              status: true,
            },
          },
        },
      });
      if (existing) {
        if (existing.userId !== userId) {
          throw new BadRequestError(
            'Offline operation id already used by another account',
            'OFFLINE_OP_ID_CONFLICT',
          );
        }
        return existing as AdWithAuthor;
      }
    }

    // The pre-check avoids unnecessary uploads; the locked check below is
    // authoritative and prevents concurrent requests from exceeding the cap.
    // Seller validation runs before any Cloudinary upload; sellerProfile
    // is therefore guaranteed for the transaction below.
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
      // TRACK-AD-STORE: optional store as visible publisher
    let resolvedStoreId: string | null = null;
    if (input.storeId) {
      const store = await prisma.storeDetails.findUnique({
        where: { id: input.storeId },
        include: { sellerProfile: { select: { userId: true } } },
      });
      if (!store) {
        throw new BadRequestError('Store not found.', 'STORE_NOT_FOUND');
      }
      // TRACK-AD-STORE (phase 2): owner or a store member with manageAds
      // (MANAGER/EDITOR) may publish under the store — same gate as
      // canManageAd applies to editing/deleting an existing store ad.
      if (store.sellerProfile.userId !== userId) {
        try {
          await requireStoreAccess(userId, store.id, 'manageAds');
        } catch {
          throw new ForbiddenError('You can only publish under a store you own or manage.', 'NOT_YOUR_STORE');
        }
      }
      if (store.status !== 'ACTIVE') {
        throw new ForbiddenError(
          'Your store must be approved before publishing ads under it.',
          'STORE_NOT_ACTIVE',
        );
      }
      resolvedStoreId = store.id;
    }

    let ad: AdWithAuthor;
    try {
      ad = await withUserAdCreationLock(userId, async () => {
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
              title: input.title,
              description: input.description,
              price: input.price,
              city: input.city,
              categoryId: input.categoryId,
              condition: input.condition,
              isNegotiable: input.isNegotiable,
              latitude: input.latitude,
              longitude: input.longitude,
              userId,
              images: uploads.map(upload => upload.url),
              sellerProfileId: sellerProfile.id,
              storeId: resolvedStoreId,
              expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
              expirationNotifiedAt: null,
              ...(offlineOperationId ? { offlineOperationId } : {}),
            },
            include: {
              user: { select: { id: true, name: true, city: true, avatarUrl: true } },
              category: { select: { id: true, name: true, nameAr: true } },
              store: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  logoUrl: true,
                  status: true,
                },
              },
            },
          });
          await sellersRepository.incrementStatsOnAdCreated(tx, sellerProfile.id);
          return created;
        });
      });
    } catch (err: unknown) {
      // FIX OFFLINE-IDEMPOTENCY-01: concurrent replay of the same X-Offline-Op-Id
      if (
        offlineOperationId &&
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'P2002'
      ) {
        const existing = await prisma.ad.findUnique({
          where: { offlineOperationId },
          include: {
            user: { select: { id: true, name: true, city: true, avatarUrl: true } },
            category: { select: { id: true, name: true, nameAr: true } },
            store: {
              select: {
                id: true,
                name: true,
                slug: true,
                logoUrl: true,
                status: true,
              },
            },
          },
        });
        if (existing && existing.userId === userId) {
          ad = existing as AdWithAuthor;
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
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

      void followsService.notifyActivityForTargets(
        [
          { targetType: FollowTargetType.USER, targetId: userId },
          ...(ad.storeId ? [{ targetType: FollowTargetType.STORE, targetId: ad.storeId }] : []),
          ...(ad.categoryId ? [{ targetType: FollowTargetType.CATEGORY, targetId: `AD:${ad.categoryId}` }] : []),
        ],
        'محتوى جديد ممن تتابعهم',
        `${ad.title} أصبح متاحًا الآن`,
        { targetType: FollowTargetType.USER, targetId: userId, contentType: 'AD', contentId: ad.id, categoryId: ad.categoryId, storeId: ad.storeId },
      ).catch((error) => reportBackgroundFailure('backend/src/modules/ads/ads.service.ts', error));

      // Fraud detection (item 12): scores the new ad against the
      // heuristic rules (rapid posting, suspicious price, off-platform
      // contact patterns, duplicate listings, ...) and auto-flags it
      // for admin review if the combined riskScore crosses the
      // configured threshold. Fire-and-forget, same contract as
      // savedSearchEvents.onAdCreated above — scoring must never fail
      // or delay ad creation itself.
      //
      // FIX M-012: previously a transient failure here (the .catch
      // below) just logged and vanished — the ad would then never be
      // fraud-scored at all, silently bypassing the entire fraud
      // detection system for that ad with no trace it happened. Now
      // also persists a FailedBackgroundTask record with enough
      // payload to retry the scoring later, so these failures show up
      // in a queryable "needs manual review" list instead of only a
      // log line.
      fraudService
        .scoreAd({
          id: ad.id,
          userId,
          title: ad.title,
          description: ad.description,
          city: ad.city,
          price: ad.price ? Number(ad.price) : null,
          categoryId: ad.categoryId,
        })
        .catch((err) => {
          logger.error('Fraud scoring failed to run for new ad', { err, adId: ad.id });
          recordFailedTask(
            'FRAUD_SCORE_AD',
            {
              adId: ad.id,
              userId,
              title: ad.title,
              description: ad.description,
              city: ad.city,
              price: ad.price ? Number(ad.price) : null,
              categoryId: ad.categoryId,
            },
            err
          ).catch((error) => reportBackgroundFailure('backend/src/modules/ads/ads.service.ts', error));
        });

      return ad;
    } catch (error) {
      await cleanupUploadedImages(uploads.map(upload => upload.publicId));
      throw error;
    }
  },

  getAds: async (query: GetAdsQuery): Promise<PaginatedResult<AdListRow>> => {
    const page = query.page || 1;
    const limit = query.limit || 20;

    // FIX AUDIT-V4-06 / ADS-CACHE-SWR-01: cache-aside with stale-while-
    // revalidate. Cache failures (Redis down, parse error) fall through to the
    // DB — caching is a performance optimization, never a correctness
    // dependency.
    return swrGet<PaginatedResult<AdListRow>>({
      name: 'ads:list',
      key: buildAdsListCacheKey(query),
      hardGenKey: ADS_GEN_HARD_KEY,
      softGenKey: ADS_GEN_SOFT_KEY,
      softTtlMs: () => ADS_LIST_SOFT_TTL_MS + Math.floor(Math.random() * (ADS_LIST_SOFT_JITTER_MS + 1)),
      hardTtlSec: ADS_LIST_HARD_TTL_SECONDS,
      lockTtlMs: ADS_LIST_LOCK_TTL_MS,
      cacheable: !query.search || query.search.length <= ADS_CACHEABLE_SEARCH_MAX,
      build: async () => {
        const { ads, total } = await adsRepository.findMany(query);
        return { items: ads, meta: buildPaginationMeta(total, page, limit) };
      },
    });
  },

  getAdById: async (id: string, viewerIp?: string): Promise<AdWithAuthor> => {
    const ad = await adsRepository.findById(id);
    if (!ad || ad.status === 'DELETED') throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');

    // SEC-FIX: findMany's list query already excludes ads from
    // suspended sellers (see ads.repository.ts), but this direct-by-id
    // lookup didn't — a suspended seller's ad page stayed fully
    // viewable/contactable by anyone with (or guessing) its id even
    // after it had dropped out of every list/search result. findById
    // here is shared with ownership/edit paths (adsService's update,
    // delete, image mutation flows) where a suspended seller must
    // still be able to see their own ad, so the check is scoped to
    // this public-read path only, not folded into findById itself.
    // sellerProfileId is nullable on Ad (legacy/edge-case ads with no
    // linked seller profile) — those have nothing to suspend, so skip.
    if (ad.sellerProfileId) {
      const sellerProfile = await sellersRepository.findById(ad.sellerProfileId);
      if (sellerProfile?.suspended) {
        throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
      }
    }

    // AUDIT-FIX (store BLOCKED): direct URL must not surface ads of a
    // blocked/pending store. Personal ads (no storeId) unaffected.
    if (ad.storeId) {
      const storeStatus = (ad as { store?: { status?: string } | null }).store?.status;
      if (storeStatus && storeStatus !== 'ACTIVE') {
        throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
      }
      // If include omitted store, load status once
      if (!storeStatus) {
        const storeRow = await prisma.storeDetails.findUnique({
          where: { id: ad.storeId },
          select: { status: true },
        });
        if (!storeRow || storeRow.status !== 'ACTIVE') {
          throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
        }
      }
    }

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

  // FIX BUG-06/BUG-07: replaces DashboardStats.tsx's previous approach
  // of fetching up to 100 ads + 100 favorites and reducing them
  // client-side (itself a fix for an even smaller silent-undercount
  // bug at the default page size of 20) — see ads.repository.ts's
  // getStatsByUserId and favorites.repository.ts's countByUserId for
  // the aggregation detail. Correct at any scale, one request.
  getMyStats: async (
    userId: string
  ): Promise<{ activeAds: number; soldAds: number; totalViews: number; favoritesCount: number }> => {
    const [adStats, favoritesCount] = await Promise.all([
      adsRepository.getStatsByUserId(userId),
      favoritesRepository.countByUserId(userId),
    ]);
    return { ...adStats, favoritesCount };
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
      personalOnly: true, // store ads belong on the store page, not seller profile
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
    if (!(await canManageAd(ad, userId, userRole))) {
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
    const justTransitionedToSold = input.status === AdStatus.SOLD && ad.status !== AdStatus.SOLD;
    const justSold = justTransitionedToSold && ad.sellerProfileId;

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
    //
    // FIX M-011: previously a transient failure here just logged and
    // vanished — favoriting users would never learn about the price
    // change at all, with no trace anywhere that the notification was
    // dropped. Now also persists a FailedBackgroundTask record with
    // enough payload to retry the fan-out later.
    if (input.price !== undefined && Number(input.price) !== Number(ad.price)) {
      favoritesRepository
        .findUserIdsByAdId(adId)
        .then((userIds) => notificationEvents.onFavoritedAdPriceChanged(userIds, adId, updated.title, updated.images?.[0]))
        .catch((err) => {
          logger.error('Failed to create FAV_AD_PRICE_CHANGED notifications', { err, adId });
          recordFailedTask(
            'FAVORITED_AD_PRICE_CHANGED',
            { adId, title: updated.title },
            err
          ).catch((error) => reportBackgroundFailure('backend/src/modules/ads/ads.service.ts', error));
        });
    }

    // Gap #15: notify everyone who favorited this ad when it's marked
    // SOLD — same fire-and-forget / recordFailedTask contract as the
    // price-change notification above, just gated on
    // justTransitionedToSold instead of a price diff. Deliberately NOT
    // gated on justSold/sellerProfileId — favoriters care about a plain
    // user-posted ad going SOLD just as much as a seller-profile one,
    // and most ads have no SellerProfile at all (see the Ad model's
    // nullable sellerProfileId), so reusing justSold here would silently
    // skip notifying favoriters for the majority of ads.
    if (justTransitionedToSold) {
      favoritesRepository
        .findUserIdsByAdId(adId)
        .then((userIds) => notificationEvents.onFavoritedAdSold(userIds, adId, updated.title, updated.images?.[0]))
        .catch((err) => {
          logger.error('Failed to create FAV_AD_SOLD notifications', { err, adId });
          recordFailedTask(
            'FAVORITED_AD_SOLD',
            { adId, title: updated.title },
            err
          ).catch((error) => reportBackgroundFailure('backend/src/modules/ads/ads.service.ts', error));
        });
    }

    // FIX AUDIT-V4-06: covers both field edits and status changes
    // (e.g. mark-as-sold) — a sold ad must stop appearing as available
    // in cached /ads results immediately, not after up to 30s.
    // A status change away from ACTIVE (sold/expired/...) must also leave
    // the homepage immediately (FIX HOME-CACHE-INVALIDATE-01).
    if (input.status && input.status !== AdStatus.ACTIVE) {
      await bumpAdsCacheVersionAndHome();
    } else {
      await bumpAdsCacheVersion();
    }

    // Gap #10: fire-and-forget, see createAd's own comment above for
    // the contract this relies on.
    activityService.record({ userId, ...activityTemplates.adUpdated(adId, updated.title) });

    // FIX FRAUD-GAP-01: scoreAd() previously only ever ran from
    // createAd — an ad could pass a clean initial scoring, get
    // published, and then be edited via this endpoint straight into
    // scam content (wire-transfer-only payment terms, a bait price, an
    // off-platform contact pattern) with zero re-evaluation, silently
    // bypassing the entire fraud detection system for its whole
    // post-creation lifetime. Re-scores here whenever an edit actually
    // touches one of the fields computeSignals() reads (title,
    // description, price, city, categoryId) — guarded the same way as
    // the price-change notification above, so a PATCH that only
    // touches unrelated fields (condition, isNegotiable, lat/lng,
    // status) doesn't pay for a rescan it can't affect. Fire-and-forget
    // with the same recordFailedTask retry contract as createAd's own
    // call — scoring must never fail or delay the ad update itself.
    const fraudRelevantFieldsChanged =
      input.title !== undefined ||
      input.description !== undefined ||
      input.price !== undefined ||
      input.city !== undefined ||
      input.categoryId !== undefined;

    if (fraudRelevantFieldsChanged) {
      fraudService
        .scoreAd({
          id: updated.id,
          userId: ad.userId,
          title: updated.title,
          description: updated.description,
          city: updated.city,
          price: updated.price ? Number(updated.price) : null,
          categoryId: updated.categoryId,
        })
        .catch((err) => {
          logger.error('Fraud scoring failed to run for updated ad', { err, adId: updated.id });
          recordFailedTask(
            'FRAUD_SCORE_AD',
            {
              adId: updated.id,
              userId: ad.userId,
              title: updated.title,
              description: updated.description,
              city: updated.city,
              price: updated.price ? Number(updated.price) : null,
              categoryId: updated.categoryId,
            },
            err
          ).catch((error) => reportBackgroundFailure('backend/src/modules/ads/ads.service.ts', error));
        });
    }

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
    if (!(await canManageAd(ad, userId, userRole))) {
      throw new ForbiddenError('You do not have permission to update this ad', 'NOT_YOUR_AD');
    }
    if (ad.images.length + files.length > MAX_IMAGES_PER_ENTITY) {
      throw new BadRequestError(`An ad can have a maximum of ${MAX_IMAGES_PER_ENTITY} images`);
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
      if (freshAd.images.length + files.length > MAX_IMAGES_PER_ENTITY) {
        throw new BadRequestError(`An ad can have a maximum of ${MAX_IMAGES_PER_ENTITY} images`);
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
    if (!(await canManageAd(ad, userId, userRole))) {
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
      // FIX MIN-IMG-RACE: re-read the ad inside the lock and re-apply
      // the "must keep at least one image" guard. Without this, the
      // pre-lock guard above is a TOCTOU: two concurrent removeImage
      // calls on the same ad — each on a different image of a
      // two-image ad — both read length=2 at pre-check time, both pass
      // the guard, then serialize through the lock and remove both
      // images, leaving an ACTIVE ad with zero photos and breaking the
      // MIN_IMAGES_REQUIRED rule that createAd, updateAd (via schema),
      // and addImages all separately enforce. Same class of bug the
      // addImages TOCTOU fix (FIX D-10) already closed on the add
      // side; this closes the remove side.
      const freshAd = await adsRepository.findById(adId);
      if (!freshAd || freshAd.status === 'DELETED') {
        throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
      }
      if (!freshAd.images.includes(imageUrl)) {
        throw new BadRequestError('Image not found in this ad');
      }
      if (freshAd.images.length <= 1) {
        throw new BadRequestError(
          'Cannot remove the last image — an ad must have at least one image. Add a replacement image first.',
          'MIN_IMAGES_REQUIRED'
        );
      }

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
    if (!(await canManageAd(ad, userId, userRole))) {
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
    if (!(await canManageAd(ad, userId, userRole))) {
      throw new ForbiddenError('You do not have permission to delete this ad', 'NOT_YOUR_AD');
    }
    await adsRepository.softDelete(adId);
    // FIX AUDIT-V4-06: a deleted ad must stop appearing in /ads results
    // immediately, not after up to 30s of cache TTL. Also clears the
    // homepage cache, which embeds ads (FIX HOME-CACHE-INVALIDATE-01).
    await bumpAdsCacheVersionAndHome();

    // Gap #10: fire-and-forget, see createAd's own comment above for
    // the contract this relies on. Logged for `userId` (the acting
    // caller) even when someone other than ad.userId deletes it — an
    // admin, or (TRACK-AD-STORE phase 2) a store owner/manager/editor
    // acting on a store-published ad — so the deletion shows up on the
    // *actor's* own timeline, not silently on the ad owner's.
    activityService.record({ userId, ...activityTemplates.adDeleted(adId, ad.title) });
  },
};
