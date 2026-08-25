import { recommendationsRepository, CategoryWeight, productRecommendationsRepository, serviceListingRecommendationsRepository, storeRecommendationsRepository } from './recommendations.repository';
import { adsService } from '../ads/ads.service';
import { productsService } from '../products/products.service';
import { serviceListingsService } from '../service-listings/service-listings.service';
import { AdListRow } from '../ads/ads.repository';
import { ProductWithStore } from '../products/products.repository';
import { ServiceListingWithProvider } from '../service-listings/service-listings.repository';
import { StoreWithSeller } from '../stores/stores.repository';
import { verifyAccessToken } from '../../shared/utils/jwt';
import { logger } from '../../shared/utils/logger';
import { GetRecommendationsQuery } from './recommendations.validation';

const DEFAULT_LIMIT = 8;

// Per-source signal strength — a favorite is a deliberate "I want this"
// action, so it outweighs a category merely browsed or an ad merely
// viewed in passing. Same relative ordering the gap report itself
// describes ("المفضلة" listed alongside search/views, favorites
// consistently being the strongest intent signal across the other
// modules — see e.g. Favorite's FAV_AD_PRICE_CHANGED notification
// existing only for favorites, not views).
const WEIGHTS = {
  favorited: 3,
  created: 2,
  viewed: 1,
} as const;

// Same fire-and-forget-safe posture as analytics.service.ts's own
// resolveOptionalUserId (this endpoint is public — see
// recommendations.routes.ts — but personalizes when a valid session
// happens to be present). Duplicated rather than imported: that
// function lives in analytics.service.ts as a local, unexported const,
// same as this one.
const resolveOptionalUserId = (authHeader: string | undefined): string | null => {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
    return verifyAccessToken(token).userId;
  } catch {
    return null;
  }
};

// Merges category ids from one signal source into the running weight
// map, taking the MAX weight per category rather than summing — a
// category the user both favorited AND viewed should rank as "strongly
// interested" (weight 3), not artificially inflated to 4+ just because
// two signals happened to agree. Summing would also let a category with
// many low-value view events outrank one with a single high-value
// favorite, inverting the intended priority.
const mergeWeights = (
  target: Map<string, number>,
  categoryIds: string[],
  weight: number
): void => {
  for (const categoryId of categoryIds) {
    const current = target.get(categoryId) ?? 0;
    if (weight > current) target.set(categoryId, weight);
  }
};

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
    authHeader: string | undefined
  ): Promise<AdListRow[]> => {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const userId = resolveOptionalUserId(authHeader);

    const excludeIds = new Set<string>();
    const weights = new Map<string, number>();

    if (query.excludeAdId) {
      excludeIds.add(query.excludeAdId);
      // Not found or deleted → this signal simply contributes nothing;
      // the request still succeeds with whatever other signals apply
      // (or falls all the way through to trending), matching
      // ads.service.ts's getRelatedAds precedent of 404ing only when
      // there's truly nothing to base a response on.
      const referenceAd = await adsService.findAdForReference(query.excludeAdId);
      if (referenceAd?.categoryId) {
        mergeWeights(weights, [referenceAd.categoryId], WEIGHTS.favorited);
      }
    }

    if (userId) {
      try {
        const [favorited, created, viewed, owned] = await Promise.all([
          recommendationsRepository.favoritedCategoryIds(userId),
          recommendationsRepository.createdAdCategoryIds(userId),
          recommendationsRepository.recentlyViewedCategoryIds(userId),
          recommendationsRepository.excludedAdIds(userId),
        ]);
        mergeWeights(weights, favorited, WEIGHTS.favorited);
        mergeWeights(weights, created, WEIGHTS.created);
        mergeWeights(weights, viewed, WEIGHTS.viewed);
        owned.forEach(id => excludeIds.add(id));
      } catch (err) {
        // A personalization failure must never break the rail — fall
        // through with whatever weights were already gathered (or none,
        // landing on trending below). Same posture as
        // analytics.service.ts's fire-and-forget event writes.
        logger.error('Failed to gather recommendation signals', { err, userId });
      }
    }

    const categoryWeights: CategoryWeight[] = Array.from(weights.entries()).map(
      ([categoryId, weight]) => ({ categoryId, weight })
    );

    const excludeIdList = Array.from(excludeIds);
    const personalized =
      categoryWeights.length > 0
        ? await recommendationsRepository.findByWeightedCategories(
            categoryWeights,
            excludeIdList,
            limit
          )
        : [];

    if (personalized.length >= limit) return personalized;

    // Backfill with trending — excluding both the original exclusions
    // and whatever personalized picks already filled the rail, so the
    // combined result never repeats an ad.
    const combinedExcludeIds = [...excludeIdList, ...personalized.map(ad => ad.id)];
    const remaining = limit - personalized.length;
    const trending = await recommendationsRepository.findTrending(combinedExcludeIds, remaining);

    return [...personalized, ...trending];
  },

  // FEAT-RECOMMENDATIONS-GENERALIZE (roadmap step 3): PRODUCT
  // counterpart of getRecommendations above. Same three-mode shape
  // (excludeProductId → detail-page mode, userId → personalized,
  // neither → trending) and same weighted-category + trending-backfill
  // core. PR4A adds recentlyViewedCategoryIds at WEIGHTS.viewed, same
  // three-signal shape (favorited/created/viewed) the AD engine has
  // always had — see recommendations.repository.ts's own comment for
  // where PRODUCT_VIEW is emitted from. WEIGHTS itself is unchanged.
  getProductRecommendations: async (
    query: GetRecommendationsQuery,
    authHeader: string | undefined
  ): Promise<ProductWithStore[]> => {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const userId = resolveOptionalUserId(authHeader);

    const excludeIds = new Set<string>();
    const weights = new Map<string, number>();

    if (query.excludeProductId) {
      excludeIds.add(query.excludeProductId);
      const referenceProduct = await productsService.findProductForReference(query.excludeProductId);
      if (referenceProduct?.categoryId) {
        mergeWeights(weights, [referenceProduct.categoryId], WEIGHTS.favorited);
      }
    }

    if (userId) {
      try {
        const [favorited, created, viewed, owned] = await Promise.all([
          productRecommendationsRepository.favoritedCategoryIds(userId),
          productRecommendationsRepository.createdCategoryIds(userId),
          productRecommendationsRepository.recentlyViewedCategoryIds(userId),
          productRecommendationsRepository.excludedIds(userId),
        ]);
        mergeWeights(weights, favorited, WEIGHTS.favorited);
        mergeWeights(weights, created, WEIGHTS.created);
        mergeWeights(weights, viewed, WEIGHTS.viewed);
        owned.forEach(id => excludeIds.add(id));
      } catch (err) {
        logger.error('Failed to gather product recommendation signals', { err, userId });
      }
    }

    const categoryWeights: CategoryWeight[] = Array.from(weights.entries()).map(
      ([categoryId, weight]) => ({ categoryId, weight })
    );
    const excludeIdList = Array.from(excludeIds);
    const personalized =
      categoryWeights.length > 0
        ? await productRecommendationsRepository.findByWeightedCategories(
            categoryWeights,
            excludeIdList,
            limit
          )
        : [];

    if (personalized.length >= limit) return personalized;

    const combinedExcludeIds = [...excludeIdList, ...personalized.map(p => p.id)];
    const remaining = limit - personalized.length;
    const trending = await productRecommendationsRepository.findTrending(combinedExcludeIds, remaining);

    return [...personalized, ...trending];
  },

  // FEAT-RECOMMENDATIONS-GENERALIZE (roadmap step 3): SERVICE_LISTING
  // counterpart — identical shape to getProductRecommendations above.
  // PR4A adds recentlyViewedCategoryIds at WEIGHTS.viewed, reading
  // SERVICE_VIEW events emitted from ServiceViewTracker.tsx. WEIGHTS
  // itself is unchanged.
  getServiceListingRecommendations: async (
    query: GetRecommendationsQuery,
    authHeader: string | undefined
  ): Promise<ServiceListingWithProvider[]> => {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const userId = resolveOptionalUserId(authHeader);

    const excludeIds = new Set<string>();
    const weights = new Map<string, number>();

    if (query.excludeServiceListingId) {
      excludeIds.add(query.excludeServiceListingId);
      const referenceListing = await serviceListingsService.findServiceListingForReference(
        query.excludeServiceListingId
      );
      if (referenceListing?.categoryId) {
        mergeWeights(weights, [referenceListing.categoryId], WEIGHTS.favorited);
      }
    }

    if (userId) {
      try {
        const [favorited, created, viewed, owned] = await Promise.all([
          serviceListingRecommendationsRepository.favoritedCategoryIds(userId),
          serviceListingRecommendationsRepository.createdCategoryIds(userId),
          serviceListingRecommendationsRepository.recentlyViewedCategoryIds(userId),
          serviceListingRecommendationsRepository.excludedIds(userId),
        ]);
        mergeWeights(weights, favorited, WEIGHTS.favorited);
        mergeWeights(weights, created, WEIGHTS.created);
        mergeWeights(weights, viewed, WEIGHTS.viewed);
        owned.forEach(id => excludeIds.add(id));
      } catch (err) {
        logger.error('Failed to gather service listing recommendation signals', { err, userId });
      }
    }

    const categoryWeights: CategoryWeight[] = Array.from(weights.entries()).map(
      ([categoryId, weight]) => ({ categoryId, weight })
    );
    const excludeIdList = Array.from(excludeIds);
    const personalized =
      categoryWeights.length > 0
        ? await serviceListingRecommendationsRepository.findByWeightedCategories(
            categoryWeights,
            excludeIdList,
            limit
          )
        : [];

    if (personalized.length >= limit) return personalized;

    const combinedExcludeIds = [...excludeIdList, ...personalized.map(l => l.id)];
    const remaining = limit - personalized.length;
    const trending = await serviceListingRecommendationsRepository.findTrending(
      combinedExcludeIds,
      remaining
    );

    return [...personalized, ...trending];
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
  getStoreRecommendations: async (
    query: GetRecommendationsQuery,
    authHeader: string | undefined
  ): Promise<StoreWithSeller[]> => {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const userId = resolveOptionalUserId(authHeader);

    const excludeIds = new Set<string>();
    if (query.excludeStoreId) excludeIds.add(query.excludeStoreId);

    if (userId) {
      try {
        const [followed, favorited, owned] = await Promise.all([
          storeRecommendationsRepository.followedStoreIds(userId),
          storeRecommendationsRepository.favoritedStoreIds(userId),
          storeRecommendationsRepository.ownStoreId(userId),
        ]);
        followed.forEach(id => excludeIds.add(id));
        favorited.forEach(id => excludeIds.add(id));
        if (owned) excludeIds.add(owned);
      } catch (err) {
        logger.error('Failed to gather store recommendation signals', { err, userId });
      }
    }

    return storeRecommendationsRepository.findRanked({
      excludeIds: Array.from(excludeIds),
      lat: query.lat,
      lng: query.lng,
      limit,
    });
  },
};
