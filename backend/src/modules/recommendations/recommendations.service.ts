import { prisma } from '../../config/prisma';
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
        owned.forEach(id => excludeIds.add(id));
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

    const excludeIdList = Array.from(excludeIds);
    const personalized =
      categoryWeights.length > 0
        ? await recommendationsRepository.findByWeightedCategories(
            categoryWeights,
            excludeIdList,
            limit,
            city,
          )
        : [];

    if (personalized.length >= limit) return personalized;

    // Backfill with trending — excluding both the original exclusions
    // and whatever personalized picks already filled the rail, so the
    // combined result never repeats an ad.
    // عند وجود مدينة: trending يفضّل إعلانات المدينة أولاً.
    const combinedExcludeIds = [...excludeIdList, ...personalized.map(ad => ad.id)];
    const remaining = limit - personalized.length;
    const trending = await recommendationsRepository.findTrending(
      combinedExcludeIds,
      remaining,
      city,
    );

    return [...personalized, ...trending];
  },

  // FEAT-RECOMMENDATIONS-GENERALIZE (roadmap step 3): PRODUCT
  // counterpart of getRecommendations above. Same three-mode shape
  // (excludeProductId → detail-page mode, userId → personalized,
  // neither → trending) and same weighted-category + trending-backfill
  // core.
  getProductRecommendations: async (
    query: GetRecommendationsQuery,
    authHeader: string | undefined
  ): Promise<ProductWithStore[]> => {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const userId = resolveOptionalUserId(authHeader);

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
    const categoryInterests: { categoryId: string; score: number }[] = [];

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
        const [interests, owned] = await Promise.all([
          productRecommendationsRepository.getProductCategoryInterest(userId),
          productRecommendationsRepository.excludedIds(userId),
        ]);

        categoryInterests.push(...interests);
        owned.forEach(id => excludeIds.add(id));
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
    const excludeIdList = Array.from(excludeIds);
    const personalized =
      categoryWeights.length > 0
        ? await productRecommendationsRepository.findByWeightedCategories(
            categoryWeights,
            excludeIdList,
            limit,
            city
          )
        : [];

    if (personalized.length >= limit) return personalized;

    const combinedExcludeIds = [...excludeIdList, ...personalized.map(p => p.id)];
    const remaining = limit - personalized.length;
    const trending = await productRecommendationsRepository.findTrending(
      combinedExcludeIds,
      remaining,
      city
    );

    return [...personalized, ...trending];
  },

  // FEAT-RECOMMENDATIONS-GENERALIZE (roadmap step 3): SERVICE_LISTING
  // counterpart — identical shape to getProductRecommendations above.
  getServiceListingRecommendations: async (
    query: GetRecommendationsQuery,
    authHeader: string | undefined
  ): Promise<ServiceListingWithProvider[]> => {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const userId = resolveOptionalUserId(authHeader);

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
        owned.forEach(id => excludeIds.add(id));
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
    const excludeIdList = Array.from(excludeIds);
    const personalized =
      categoryWeights.length > 0
        ? await serviceListingRecommendationsRepository.findByWeightedCategories(
            categoryWeights,
            excludeIdList,
            limit,
            city
          )
        : [];

    if (personalized.length >= limit) return personalized;

    const combinedExcludeIds = [...excludeIdList, ...personalized.map(l => l.id)];
    const remaining = limit - personalized.length;
    const trending = await serviceListingRecommendationsRepository.findTrending(
      combinedExcludeIds,
      remaining,
      city
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
