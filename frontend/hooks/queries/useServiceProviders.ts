'use client';

import { useQuery } from '@tanstack/react-query';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import type { NearbyServiceProvidersParams } from '@/types/service.types';

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

/** GET /service-providers/nearby — Haversine search, requires lat/lng. */
export function useNearbyServiceProviders(params: NearbyServiceProvidersParams | null) {
  return useQuery({
    queryKey: queryKeys.serviceProviders.nearby(params ?? undefined),
    queryFn: () => serviceProvidersApi.getNearby(params!).then((r) => r.data.data),
    staleTime: CACHE_TTL.adsList,
    enabled: params !== null,
  });
}
