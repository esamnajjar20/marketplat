/**
 * Recommendations query hooks (Gap #9 — "قد يعجبك أيضًا", generalized
 * to products/services/stores in PR4B/PR4C).
 *
 * useRecommendations() keeps its exact original two-call shape,
 * matching the two modes recommendations.service.ts supports for ads
 * on the backend:
 *   - useRecommendations()                    → personalized home-feed
 *     rail (or trending, for a logged-out visitor / one with no
 *     signal history yet).
 *   - useRecommendations({ excludeAdId: id }) → "related to this ad"
 *     rail for the ad-detail page, ranked by that ad's own category.
 *
 * The three hooks below are the product/service/store counterparts,
 * each following the same "exclude the entity currently being
 * viewed" shape via the backend's excludeProductId/excludeServiceListingId/
 * excludeStoreId params — never client-side filtering (see
 * recommendations.validation.ts on the backend for why the exclusion
 * itself has to happen server-side: a personalized rail can otherwise
 * legitimately fall one item short of `limit` after a client-side
 * filter).
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import type {
  GetRecommendationsParams,
  GetProductRecommendationsParams,
  GetServiceRecommendationsParams,
  GetStoreRecommendationsParams,
} from '@/api/recommendations.api';
import { recommendationsApi } from '@/api/recommendations.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

export function useRecommendations(params?: GetRecommendationsParams) {
  return useQuery({
    queryKey: queryKeys.recommendations.list(params),
    queryFn: () => recommendationsApi.getRecommendations(params).then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.recommendations,
  });
}

/**
 * Product-context rail — see StoreProducts.tsx's own comment on why
 * the `?product=` deep link is this app's only "product detail"
 * moment (there is no dedicated /products/:id route yet). `enabled`
 * lets the caller gate this off until a product is actually
 * highlighted, same reasoning useRelatedAds(id) gates on a non-empty
 * id, generalized here to an explicit flag since the "is a product in
 * view" condition isn't as simple as "is the id string non-empty".
 */
export function useProductRecommendations(
  params?: GetProductRecommendationsParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: queryKeys.recommendations.products(params),
    queryFn: () =>
      recommendationsApi.getProductRecommendations(params).then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.recommendations,
    enabled: options?.enabled ?? true,
  });
}

/** Service-listing-detail-page rail — always enabled, same shape as useRecommendations(). */
export function useServiceRecommendations(params?: GetServiceRecommendationsParams) {
  return useQuery({
    queryKey: queryKeys.recommendations.services(params),
    queryFn: () =>
      recommendationsApi.getServiceRecommendations(params).then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.recommendations,
  });
}

/**
 * Store-detail-page rail. lat/lng are an optional ranking signal only
 * (see recommendations.api.ts's GetStoreRecommendationsParams) — never
 * mandatory, matching the backend's own `.refine` that only requires
 * lat/lng to be provided *together*, not at all. A caller with no
 * coordinates simply omits them; the query still fires.
 */
export function useStoreRecommendations(params?: GetStoreRecommendationsParams) {
  return useQuery({
    queryKey: queryKeys.recommendations.stores(params),
    queryFn: () =>
      recommendationsApi.getStoreRecommendations(params).then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.recommendations,
  });
}
