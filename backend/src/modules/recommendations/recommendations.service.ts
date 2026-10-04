import { prisma } from '../../config/prisma';
import { recommendationsRepository, CategoryWeight, productRecommendationsRepository, serviceListingRecommendationsRepository, storeRecommendationsRepository, serviceProviderRecommendationsRepository } from './recommendations.repository';
import { adsService } from '../ads/ads.service';
import { productsService } from '../products/products.service';
import { serviceListingsService } from '../service-listings/service-listings.service';
import { AdListRow } from '../ads/ads.repository';
import { ProductWithStore, ProductWithStoreLite } from '../products/products.repository';
import { ServiceListingWithProvider } from '../service-listings/service-listings.repository';
import { StoreWithSeller } from '../stores/stores.repository';
import { verifyAccessToken } from '../../shared/utils/jwt';
import { logger } from '../../shared/utils/logger';
import { GetRecommendationsQuery } from './recommendations.validation';

const DEFAULT_LIMIT = 8;

// Same fire-and-forget-safe posture as analytics.service.ts's own
// resolveOptionalUserId (this endpoint is public — see
// recommendations.routes.ts — but personalizes when a valid session
// happens to be present). Duplicated rather than imported: that
// function lives in analytics.service.ts as a local, unexported const,
// same as this one.
export const resolveOptionalUserId = (authHeader: string | undefined): string | null => {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
    return verifyAccessToken(token).userId;
  } catch {
    return null;
  }
};

// RECS-CACHE-01: the SWR cache (recommendations.cache.ts) resolves the
// caller once, keys the entry by that identity, and passes it in here.
// A background refresh must NOT re-verify the original Bearer token:
// it may have expired by then, which would silently rebuild the entry
// as a guest rail and store it under the user's key. `undefined` keeps
// the pre-existing behaviour (resolve from the header).
const resolveUserId = (
  authHeader: string | undefined,
  userIdOverride: string | null | undefined,
): string | null =>
  userIdOverride !== undefined ? userIdOverride : resolveOptionalUserId(authHeader);

export interface MixedRecommendations {
  ads: AdListRow[] | null;
  products: ProductWithStoreLite[] | null;
  services: ServiceListingWithProvider[] | null;
}

export const recommendationsService = {
  // GET /recommendations. Two modes, chosen by which signals are
  // available rather than by a caller-supplied "mode" flag:
  //   - excludeAdId present  → ad-detail-page mode: rank by that one
  //     ad's own category (a stronger, more specific signal than a
  //     user's general taste history) alongside the personalized
  //     signals below, and always exclude that ad itself.
  //   - userId resolvable    → personalized home-feed mode: rank by
  //     the user's own favorite/created/viewed category history.
  //   - neither               → anonymous fallback: platform trending.
  // All three funnel through the same weighted-category query plus the
  // same trending backfill, so a short personalized result set is
  // topped up with trending ads rather than ever returning fewer than
  // `limit` when enough active ads exist platform-wide.
  getRecommendations: async (
    query: GetRecommendationsQuery,
    authHeader: string | undefined,
    userIdOverride?: string | null,
  ): Promise<AdListRow[]> => {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const userId = resolveUserId(authHeader, userIdOverride);

    const excludeIds = new Set<string>();
    // Owned + favorited: hidden while there is anything else to show, but
    // used as a last-resort backfill so a small catalog (or a seller who
    // owns most of it) never ends up with a one-card rail.
    const softExcludeIds = new Set<string>();
    const categoryInterests: { categoryId: string; score: number }[] = [];

    // مدينة المستخدم: من الاستعلام أو من الملف الشخصي (أولوية للاقتراحات)
    let city: string | null = query.city?.trim() || null;
    if (!city && userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { city: true },
        });
        city = user?.city?.trim() || null;
      } catch (err) {
        logger.error('Failed to resolve user city for recommendations', { err, userId });
      }
    }

    if (query.excludeAdId) {
      excludeIds.add(query.excludeAdId);
      // Not found or deleted → this signal simply contributes nothing;
      // the request still succeeds with whatever other signals apply
      // (or falls all the way through to trending), matching
      // ads.service.ts's getRelatedAds precedent of 404ing only when
      // there's truly nothing to base a response on.
      const referenceAd = await adsService.findAdForReference(query.excludeAdId);
      if (referenceAd?.categoryId) {
        categoryInterests.push({
          categoryId: referenceAd.categoryId,
          score: 6,
        });
      }
    }

    if (userId) {
      try {
        const [interests, owned] = await Promise.all([
          recommendationsRepository.getAdCategoryInterest(userId),
          recommendationsRepository.excludedAdIds(userId),
        ]);

        categoryInterests.push(...interests);
        owned.forEach(id => softExcludeIds.add(id));
      } catch (err) {
        // A personalization failure must never break the rail — fall
        // through with whatever weights were already gathered (or none,
        // landing on trending below). Same posture as
        // analytics.service.ts's fire-and-forget event writes.
        logger.error('Failed to gather recommendation signals', { err, userId });
      }
    }

    const categoryWeights: CategoryWeight[] = Array.from(
      categoryInterests.reduce((scores, interest) => {
        scores.set(
          interest.categoryId,
          (scores.get(interest.categoryId) ?? 0) + interest.score,
        );
        return scores;
      }, new Map<string, number>()),
    ).map(([categoryId, weight]) => ({ categoryId, weight }));

    const hardExcludeIds = Array.from(excludeIds);
    const excludeIdList = [...hardExcludeIds, ...softExcludeIds];
    let personalized: AdListRow[] = [];

    if (categoryWeights.length > 0) {
      // City is a ranking priority, not a hard filter: take the best city
      // matches first, then use the same interest profile across Gaza to
      // fill any remaining slots.
      personalized = await recommendationsRepository.findByWeightedCategories(
        categoryWeights, excludeIdList, limit, city,
      );
      if (city && personalized.length < limit) {
        const more = await recommendationsRepository.findByWeightedCategories(
          categoryWeights, [...excludeIdList, ...personalized.map(ad => ad.id)],
          limit - personalized.length, null,
        );
        personalized = [...personalized, ...more];
      }
    }

    if (personalized.length >= limit) return personalized;

    // Fill in layers: city trending → general trending. This guarantees a
    // city preference without allowing a sparse city to make the rail sparse.
    const cityExclude = [...excludeIdList, ...personalized.map(ad => ad.id)];
    const cityTrending = city
      ? await recommendationsRepository.findTrending(cityExclude, limit - personalized.length, city)
      : [];
    const afterCity = [...personalized, ...cityTrending];
    if (afterCity.length >= limit) return afterCity;

    const generalTrending = await recommendationsRepository.findTrending(
      [...excludeIdList, ...afterCity.map(ad => ad.id)],
      limit - afterCity.length,
      null,
    );
    const ranked = [...afterCity, ...generalTrending];
    if (ranked.length >= limit || softExcludeIds.size === 0) return ranked;

    // Last resort: bring back owned/favorited items (never the reference
    // item itself) so the rail is not left nearly empty.
    const rest = await recommendationsRepository.findTrending(
      [...hardExcludeIds, ...ranked.map(ad => ad.id)], limit - ranked.length, null,
    );
    if (rest.length > 0) {
      logger.debug('[recommendations] last-resort backfill used', { kind: 'ad', userId, restored: rest.length });
    }
    return [...ranked, ...rest];
  },

  // FEAT-RECOMMENDATIONS-GENERALIZE (roadmap step 3): PRODUCT
  // counterpart of getRecommendations above. Same three-mode shape
  // (excludeProductId → detail-page mode, userId → personalized,
  // neither → trending) and same weighted-category + trending-backfill
  // core.
  getProductRecommendations: async (
    query: GetRecommendationsQuery,
    authHeader: string | undefined,
    userIdOverride?: string | null,
  ): Promise<ProductWithStoreLite[]> => {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const userId = resolveUserId(authHeader, userIdOverride);

    let city: string | null = query.city?.trim() || null;

    if (!city && userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { city: true },
        });
        city = user?.city?.trim() || null;
      } catch (err) {
        logger.error('Failed to resolve user city for product recommendations', {
          err,
          userId,
        });
      }
    }

    const excludeIds = new Set<string>();
    // Owned + favorited: hidden while there is anything else to show, but
    // used as a last-resort backfill so a small catalog (or a seller who
    // owns most of it) never ends up with a one-card rail.
    const softExcludeIds = new Set<string>();
    const categoryInterests: { categoryId: string; score: number }[] = [];
    let followedStoreIds: string[] = [];

    if (query.excludeProductId) {
      excludeIds.add(query.excludeProductId);
      const referenceProduct = await productsService.findProductForReference(query.excludeProductId);
      if (referenceProduct?.categoryId) {
        categoryInterests.push({
          categoryId: referenceProduct.categoryId,
          score: 6,
        });
      }
    }

    if (userId) {
      try {
        const [interests, owned, followedStores] = await Promise.all([
          productRecommendationsRepository.getProductCategoryInterest(userId),
          productRecommendationsRepository.excludedIds(userId),
          prisma.storeFollower.findMany({ where: { userId }, select: { storeId: true } }),
        ]);

        categoryInterests.push(...interests);
        owned.forEach(id => softExcludeIds.add(id));
        // Kept local to this request: followed stores are a product-level
        // affinity signal, not a reason to expose the store name on cards.
        followedStoreIds = followedStores.map(row => row.storeId);
      } catch (err) {
        logger.error('Failed to gather product recommendation signals', { err, userId });
      }
    }

    const categoryWeights: CategoryWeight[] = Array.from(
      categoryInterests.reduce((scores, interest) => {
        scores.set(
          interest.categoryId,
          (scores.get(interest.categoryId) ?? 0) + interest.score,
        );
        return scores;
      }, new Map<string, number>()),
    ).map(([categoryId, weight]) => ({ categoryId, weight }));
    const hardExcludeIds = Array.from(excludeIds);
    const excludeIdList = [...hardExcludeIds, ...softExcludeIds];
    let personalized: ProductWithStoreLite[] = [];

    if (categoryWeights.length > 0) {
      personalized = await productRecommendationsRepository.findByWeightedCategories(
        categoryWeights, excludeIdList, limit, city, followedStoreIds,
      );
      if (city && personalized.length < limit) {
        const more = await productRecommendationsRepository.findByWeightedCategories(
          categoryWeights, [...excludeIdList, ...personalized.map(p => p.id)],
          limit - personalized.length, null, followedStoreIds,
        );
        personalized = [...personalized, ...more];
      }
    }

    if (personalized.length >= limit) return personalized;

    const cityExclude = [...excludeIdList, ...personalized.map(p => p.id)];
    const cityTrending = city
      ? await productRecommendationsRepository.findTrending(cityExclude, limit - personalized.length, city)
      : [];
    const afterCity = [...personalized, ...cityTrending];
    if (afterCity.length >= limit) return afterCity;

    const generalTrending = await productRecommendationsRepository.findTrending(
      [...excludeIdList, ...afterCity.map(p => p.id)], limit - afterCity.length, null,
    );
    const ranked = [...afterCity, ...generalTrending];
    if (ranked.length >= limit || softExcludeIds.size === 0) return ranked;

    // Last resort: bring back owned/favorited items (never the reference
    // item itself) so the rail is not left nearly empty.
    const rest = await productRecommendationsRepository.findTrending(
      [...hardExcludeIds, ...ranked.map(p => p.id)], limit - ranked.length, null,
    );
    if (rest.length > 0) {
      logger.debug('[recommendations] last-resort backfill used', { kind: 'product', userId, restored: rest.length });
    }
    return [...ranked, ...rest];
  },

  // FEAT-RECOMMENDATIONS-GENERALIZE (roadmap step 3): SERVICE_LISTING
  // counterpart — identical shape to getProductRecommendations above.
  getServiceListingRecommendations: async (
    query: GetRecommendationsQuery,
    authHeader: string | undefined,
    userIdOverride?: string | null,
  ): Promise<ServiceListingWithProvider[]> => {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const userId = resolveUserId(authHeader, userIdOverride);

    let city: string | null = query.city?.trim() || null;

    if (!city && userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { city: true },
        });
        city = user?.city?.trim() || null;
      } catch (err) {
        logger.error('Failed to resolve user city for service recommendations', {
          err,
          userId,
        });
      }
    }

    const excludeIds = new Set<string>();
    // Owned + favorited: hidden while there is anything else to show, but
    // used as a last-resort backfill so a small catalog (or a seller who
    // owns most of it) never ends up with a one-card rail.
    const softExcludeIds = new Set<string>();
    const categoryInterests: { categoryId: string; score: number }[] = [];

    if (query.excludeServiceListingId) {
      excludeIds.add(query.excludeServiceListingId);
      const referenceListing = await serviceListingsService.findServiceListingForReference(
        query.excludeServiceListingId
      );
      if (referenceListing?.categoryId) {
        categoryInterests.push({
          categoryId: referenceListing.categoryId,
          score: 6,
        });
      }
    }

    if (userId) {
      try {
        const [interests, owned] = await Promise.all([
          serviceListingRecommendationsRepository.getServiceCategoryInterest(userId),
          serviceListingRecommendationsRepository.excludedIds(userId),
        ]);

        categoryInterests.push(...interests);
        owned.forEach(id => softExcludeIds.add(id));
      } catch (err) {
        logger.error('Failed to gather service listing recommendation signals', { err, userId });
      }
    }

    const categoryWeights: CategoryWeight[] = Array.from(
      categoryInterests.reduce((scores, interest) => {
        scores.set(
          interest.categoryId,
          (scores.get(interest.categoryId) ?? 0) + interest.score,
        );
        return scores;
      }, new Map<string, number>()),
    ).map(([categoryId, weight]) => ({ categoryId, weight }));
    const hardExcludeIds = Array.from(excludeIds);
    const excludeIdList = [...hardExcludeIds, ...softExcludeIds];
    let personalized: ServiceListingWithProvider[] = [];

    if (categoryWeights.length > 0) {
      personalized = await serviceListingRecommendationsRepository.findByWeightedCategories(
        categoryWeights, excludeIdList, limit, city,
      );
      if (city && personalized.length < limit) {
        const more = await serviceListingRecommendationsRepository.findByWeightedCategories(
          categoryWeights, [...excludeIdList, ...personalized.map(l => l.id)],
          limit - personalized.length, null,
        );
        personalized = [...personalized, ...more];
      }
    }

    if (personalized.length >= limit) return personalized;

    const cityExclude = [...excludeIdList, ...personalized.map(l => l.id)];
    const cityTrending = city
      ? await serviceListingRecommendationsRepository.findTrending(cityExclude, limit - personalized.length, city)
      : [];
    const afterCity = [...personalized, ...cityTrending];
    if (afterCity.length >= limit) return afterCity;

    const generalTrending = await serviceListingRecommendationsRepository.findTrending(
      [...excludeIdList, ...afterCity.map(l => l.id)], limit - afterCity.length, null,
    );
    const ranked = [...afterCity, ...generalTrending];
    if (ranked.length >= limit || softExcludeIds.size === 0) return ranked;

    // Last resort: bring back owned/favorited items (never the reference
    // item itself) so the rail is not left nearly empty.
    const rest = await serviceListingRecommendationsRepository.findTrending(
      [...hardExcludeIds, ...ranked.map(l => l.id)], limit - ranked.length, null,
    );
    if (rest.length > 0) {
      logger.debug('[recommendations] last-resort backfill used', { kind: 'service', userId, restored: rest.length });
    }
    return [...ranked, ...rest];
  },

  // RECS-MIXED-01: the three home-shelf rails in one call. Same engines as
  // the single-type methods above — this only removes 2 round trips, the
  // duplicated bearer verification and the duplicated city lookup (each
  // single-type method resolves the profile city on its own).
  //
  // Section isolation, same posture as home.service.ts's settle(): one
  // failing rail resolves to null instead of failing the whole shelf, and
  // the cache layer refuses to pin a response that contains a null.
  getMixedRecommendations: async (
    query: GetRecommendationsQuery,
    authHeader: string | undefined,
    userIdOverride?: string | null,
  ): Promise<MixedRecommendations> => {
    const userId = resolveUserId(authHeader, userIdOverride);

    let city: string | null = query.city?.trim() || null;
    if (!city && userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { city: true },
        });
        city = user?.city?.trim() || null;
      } catch (err) {
        logger.error('Failed to resolve user city for mixed recommendations', { err, userId });
      }
    }

    // Per-entity exclusion params make no sense for a mixed shelf (each
    // names one entity of one type) and must not leak into the others.
    const shared: GetRecommendationsQuery = {
      limit: query.limit,
      ...(city ? { city } : {}),
    };

    const settle = async <T>(name: string, run: () => Promise<T>): Promise<T | null> => {
      try {
        return await run();
      } catch (err) {
        logger.error(`[recommendations] mixed section "${name}" failed`, { err, userId });
        return null;
      }
    };

    const [ads, products, services] = await Promise.all([
      settle('ads', () => recommendationsService.getRecommendations(shared, authHeader, userId)),
      settle('products', () =>
        recommendationsService.getProductRecommendations(shared, authHeader, userId),
      ),
      settle('services', () =>
        recommendationsService.getServiceListingRecommendations(shared, authHeader, userId),
      ),
    ]);

    return { ads, products, services };
  },

  // PR4B (Store Recommendations). Unlike the three entities above, this
  // is NOT a "personalized query with a trending backfill" shape —
  // there's only one query (storeRecommendationsRepository.findRanked),
  // used for every caller alike, because the ranking formula itself
  // (freshness/activity → distance → limited plan boost → createdAt)
  // IS the honest fallback the task asked for, not a weaker substitute
  // for a personalized one. See recommendations.repository.ts's own
  // header comment on storeRecommendationsRepository for the full
  // design and why followed/favorited stores are read as an exclusion
  // signal rather than a similarity one.
  //
  // A signal-gathering failure (same posture as the other three
  // getX Recommendations above) must never break the rail — on error,
  // this falls through with only excludeStoreId (if any) excluded,
  // landing on the exact same ranked query an anonymous caller gets.
  getServiceProviderRecommendations: async (
    query: GetRecommendationsQuery,
    authHeader: string | undefined,
    userIdOverride?: string | null,
  ) => {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const userId = resolveUserId(authHeader, userIdOverride);
    let city: string | null = query.city?.trim() || null;
    let interestCategoryIds: string[] = [];

    if (!city && userId) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { city: true } }).catch(() => null);
      city = user?.city?.trim() || null;
    }
    if (userId) {
      try {
        const interests = await serviceListingRecommendationsRepository.getServiceCategoryInterest(userId);
        interestCategoryIds = interests.map(item => item.categoryId).slice(0, 12);
      } catch (err) {
        logger.error('Failed to gather service-provider recommendation signals', { err, userId });
      }
    }

    const cityItems = await serviceProviderRecommendationsRepository.findRanked({ city, interestCategoryIds, limit });
    if (!city || cityItems.length >= limit) return cityItems;

    const general = await serviceProviderRecommendationsRepository.findRanked({
      city: null,
      interestCategoryIds,
      limit: limit - cityItems.length,
    });
    const seen = new Set(cityItems.map(item => item.id));
    return [...cityItems, ...general.filter(item => !seen.has(item.id))];
  },

  getStoreRecommendations: async (
    query: GetRecommendationsQuery,
    authHeader: string | undefined,
    userIdOverride?: string | null,
  ): Promise<StoreWithSeller[]> => {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const userId = resolveUserId(authHeader, userIdOverride);

    const excludeIds = new Set<string>();
    // Owned/followed/favorited: hidden while there is anything else to show,
    // but used as a last-resort backfill so a small catalog (or a seller who
    // owns most of it) never ends up with a one-card rail.
    const softExcludeIds = new Set<string>();
    if (query.excludeStoreId) excludeIds.add(query.excludeStoreId);
    let city: string | null = query.city?.trim() || null;
    let interestCategoryIds: string[] = [];

    if (!city && userId) {
      try {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { city: true } });
        city = user?.city?.trim() || null;
      } catch (err) {
        logger.error('Failed to resolve user city for store recommendations', { err, userId });
      }
    }

    if (userId) {
      try {
        const [followed, favorited, owned, productInterests] = await Promise.all([
          storeRecommendationsRepository.followedStoreIds(userId),
          storeRecommendationsRepository.favoritedStoreIds(userId),
          storeRecommendationsRepository.ownStoreId(userId),
          productRecommendationsRepository.getProductCategoryInterest(userId),
        ]);
        followed.forEach(id => softExcludeIds.add(id));
        favorited.forEach(id => softExcludeIds.add(id));
        if (owned) softExcludeIds.add(owned);
        interestCategoryIds = productInterests.map(item => item.categoryId).slice(0, 12);
      } catch (err) {
        logger.error('Failed to gather store recommendation signals', { err, userId });
      }
    }

    const hardExcludeIds = Array.from(excludeIds);
    const excludeIdList = [...hardExcludeIds, ...softExcludeIds];

    const ranked = await storeRecommendationsRepository.findRanked({
      excludeIds: excludeIdList,
      city,
      interestCategoryIds,
      lat: query.lat,
      lng: query.lng,
      limit,
    });
    if (ranked.length >= limit || softExcludeIds.size === 0) return ranked;

    // Last resort: bring back followed/favorited/owned (never the reference
    // store itself) so the rail is not left nearly empty.
    const rest = await storeRecommendationsRepository.findRanked({
      excludeIds: [...hardExcludeIds, ...ranked.map(s => s.id)],
      city,
      interestCategoryIds,
      lat: query.lat,
      lng: query.lng,
      limit: limit - ranked.length,
    });
    return [...ranked, ...rest];
  },
};
