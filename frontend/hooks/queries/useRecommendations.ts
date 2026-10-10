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

import { queryOptions, useQuery } from '@tanstack/react-query';
import type {
  GetRecommendationsParams,
  GetProductRecommendationsParams,
  GetServiceRecommendationsParams,
  GetStoreRecommendationsParams,
  GetProviderRecommendationsParams,
  GetMixedRecommendationsParams,
} from '@/api/recommendations.api';
import { recommendationsApi } from '@/api/recommendations.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated, selectIsAuthResolving } from '@/store/auth.store';

export interface RecommendationQueryOptions {
  enabled?: boolean;
  /** Separates guest (trending) from user (personalized) cache entries. */
  scope?: 'guest' | 'user';
}

/**
 * Shared, typed query-option factories keep the cache key, API parameters,
 * and result inference together. Components that prefetch can reuse the same
 * options instead of rebuilding queryKey/queryFn pairs independently.
 */
export const recommendationQueryOptions = {
  ads: (params?: GetRecommendationsParams, options?: RecommendationQueryOptions) =>
    queryOptions({
      queryKey: queryKeys.recommendations.list(params, options?.scope),
      queryFn: () => recommendationsApi.getRecommendations(params).then((r) => r.data.data ?? []),
      staleTime: CACHE_TTL.recommendations,
      enabled: options?.enabled ?? true,
    }),
  products: (params?: GetProductRecommendationsParams, options?: RecommendationQueryOptions) =>
    queryOptions({
      queryKey: queryKeys.recommendations.products(params, options?.scope),
      queryFn: () => recommendationsApi.getProductRecommendations(params).then((r) => r.data.data ?? []),
      staleTime: CACHE_TTL.recommendations,
      enabled: options?.enabled ?? true,
    }),
  services: (params?: GetServiceRecommendationsParams, options?: RecommendationQueryOptions) =>
    queryOptions({
      queryKey: queryKeys.recommendations.services(params, options?.scope),
      queryFn: () => recommendationsApi.getServiceRecommendations(params).then((r) => r.data.data ?? []),
      staleTime: CACHE_TTL.recommendations,
      enabled: options?.enabled ?? true,
    }),
  stores: (params?: GetStoreRecommendationsParams, options?: RecommendationQueryOptions) =>
    queryOptions({
      queryKey: queryKeys.recommendations.stores(params, options?.scope),
      queryFn: () => recommendationsApi.getStoreRecommendations(params).then((r) => r.data.data ?? []),
      staleTime: CACHE_TTL.recommendations,
    }),
  providers: (params?: GetProviderRecommendationsParams, options?: RecommendationQueryOptions) =>
    queryOptions({
      queryKey: queryKeys.recommendations.providers(params, options?.scope),
      queryFn: () => recommendationsApi.getProviderRecommendations(params).then((r) => r.data.data ?? []),
      staleTime: CACHE_TTL.recommendations,
      enabled: options?.enabled ?? true,
    }),
  mixed: (params?: GetMixedRecommendationsParams, options?: RecommendationQueryOptions) =>
    queryOptions({
      queryKey: queryKeys.recommendations.mixed(params, options?.scope),
      queryFn: () => recommendationsApi.getMixedRecommendations(params).then((r) => r.data.data ?? { ads: null, products: null, services: null }),
      staleTime: CACHE_TTL.recommendations,
      enabled: options?.enabled ?? true,
    }),
};

function withCallerScope(
  options: RecommendationQueryOptions | undefined,
  isAuthenticated: boolean,
  isAuthResolving: boolean,
): RecommendationQueryOptions {
  return {
    ...options,
    // Don't issue a guest query while cookie-backed auth is still being
    // restored. Once auth settles, the query starts with the correct scope
    // instead of fetching guest recommendations and immediately refetching.
    enabled: (options?.enabled ?? true) && !isAuthResolving,
    scope: options?.scope ?? (isAuthenticated ? 'user' : 'guest'),
  };
}

export function useRecommendations(params?: GetRecommendationsParams, options?: RecommendationQueryOptions) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);
  return useQuery(recommendationQueryOptions.ads(params, withCallerScope(options, isAuthenticated, isAuthResolving)));
}

export function useProductRecommendations(params?: GetProductRecommendationsParams, options?: RecommendationQueryOptions) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);
  return useQuery(recommendationQueryOptions.products(params, withCallerScope(options, isAuthenticated, isAuthResolving)));
}

export function useServiceRecommendations(params?: GetServiceRecommendationsParams, options?: RecommendationQueryOptions) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);
  return useQuery(recommendationQueryOptions.services(params, withCallerScope(options, isAuthenticated, isAuthResolving)));
}

export function useStoreRecommendations(params?: GetStoreRecommendationsParams, options?: RecommendationQueryOptions) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);
  return useQuery(recommendationQueryOptions.stores(params, withCallerScope(options, isAuthenticated, isAuthResolving)));
}

export function useProviderRecommendations(params?: GetProviderRecommendationsParams, options?: RecommendationQueryOptions) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);
  return useQuery(recommendationQueryOptions.providers(params, withCallerScope(options, isAuthenticated, isAuthResolving)));
}

export function useMixedRecommendations(params?: GetMixedRecommendationsParams, options?: RecommendationQueryOptions) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);
  return useQuery(recommendationQueryOptions.mixed(params, withCallerScope(options, isAuthenticated, isAuthResolving)));
}

