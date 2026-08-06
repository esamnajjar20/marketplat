import { recommendationsRepository, CategoryWeight } from './recommendations.repository';
import { adsService } from '../ads/ads.service';
import { AdListRow } from '../ads/ads.repository';
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
};
