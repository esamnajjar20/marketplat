'use client';

import { useQuery } from '@tanstack/react-query';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import type { NearbyServiceProvidersParams, ServiceProvidersQuery } from '@/types/service.types';

/**
 * Phase 3: GET /service-providers — public city/browse directory.
 * Same shape as useStores/useProducts: city is optional server-side,
 * so an undefined/empty params object still resolves to the general/
 * unfiltered list rather than staying idle — no `enabled` gate is
 * required by default.
 *
 * FIX (audit §6, useNearbyProvidersForHome cascade): an explicit
 * `enabled` option was added anyway, matching useAds' own convention
 * (see useAds.ts's PERF-04 comment) — useNearbyProvidersForHome calls
 * this hook unconditionally per Rules of Hooks even when the resolved
 * source is GPS, and without a real `enabled: false` that call would
 * silently double-fire a second, wasted city-filtered request in
 * parallel with the GPS/nearby one every single time.
 */
export function useServiceProviders(params?: ServiceProvidersQuery, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.serviceProviders.list(params),
    queryFn: () => serviceProvidersApi.getAll(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.adsList,
    enabled: options?.enabled,
  });
}

/** GET /service-providers/:id — public provider page. No auth required. */
export function useServiceProvider(id: string) {
  return useQuery({
    queryKey: queryKeys.serviceProviders.detail(id),
    queryFn: () => serviceProvidersApi.getById(id).then((r) => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: Boolean(id),
  });
}

/**
 * GET /service-providers/me — the caller's own provider profile.
 * A 404 here just means "not a provider yet", not an error state —
 * same convention as useMySellerProfile: callers should treat
 * `isError` (with no data) as "show a become-a-provider CTA".
 */
export function useMyServiceProvider() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.serviceProviders.me(),
    queryFn: () => serviceProvidersApi.getMyProvider().then((r) => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated,
    retry: false,
  });
}

/**
 * Derived provider status. Same shape/rationale as useIsSeller
 * (see useSellers.ts) — returns both isProvider and isLoaded since
 * call sites need to distinguish "still loading" from "loaded, not
 * a provider".
 */
export function useIsProvider(): { isProvider: boolean; isLoaded: boolean } {
  const { data, isSuccess } = useMyServiceProvider();
  return { isProvider: isSuccess && Boolean(data), isLoaded: isSuccess };
}

/** GET /service-providers/nearby — Haversine search, requires lat/lng. */
export function useNearbyServiceProviders(params: NearbyServiceProvidersParams | null) {
  return useQuery({
    queryKey: queryKeys.serviceProviders.nearby(params ?? undefined),
    queryFn: () => serviceProvidersApi.getNearby(params!).then((r) => r.data.data),
    staleTime: CACHE_TTL.adsList,
    enabled: params !== null,
  });
}

/**
 * GET /service-providers/me/analytics — owner-only dashboard. Same
 * shape/rationale as useMyStoreAnalytics (useStores.ts): a 404 here
 * means "not a provider yet", not a real error — MyServiceProviderAnalytics
 * treats that as its own empty state rather than retrying.
 */
export function useMyServiceProviderAnalytics(period: '7d' | '30d' | 'all' = 'all') {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: [...queryKeys.serviceProviders.analytics(), period],
    queryFn: () => serviceProvidersApi.getMyAnalytics(period).then((r) => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated,
    retry: false,
  });
}
