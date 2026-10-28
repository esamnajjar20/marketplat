'use client';

import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
  selectIsAuthResolving,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { NearbyServiceProvidersParams, ServiceProvidersQuery, ServiceProviderDetails } from '@/types/service.types';
import {
  getOfflineJson,
  saveOfflineJson,
  OFFLINE_JSON_KEYS,
} from '@/lib/offlineJsonCache';

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
 *
 * FIX OFFLINE-SELLER-GATE-01: same fix as useMySellerProfile/useMyStore
 * (see useMySellerProfile's comment for the full rationale) — a plain
 * network failure was indistinguishable from a genuine 404, so a real
 * service provider going offline was shown "فعّل ملف مقدم الخدمة أولاً"
 * and blocked from /my-services/new. Only a real network failure
 * (statusCode:0) falls back to the last successfully fetched profile;
 * a confirmed 404 still blocks as before.
 */
export function useMyServiceProvider() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  // T770 — user-scoped.
  const userId = useAuthStore((s) => s.user?.id ?? null);

  return useQuery({
    queryKey: queryKeys.serviceProviders.me(),
    queryFn: async () => {
      try {
        const data = await serviceProvidersApi.getMyProvider().then((r) => r.data.data);
        if (data) saveOfflineJson(OFFLINE_JSON_KEYS.serviceProviderSelf, data, userId);
        return data;
      } catch (err) {
        const isNetworkFailure = (err as { statusCode?: number })?.statusCode === 0;
        if (isNetworkFailure) {
          const cached = getOfflineJson<ServiceProviderDetails>(OFFLINE_JSON_KEYS.serviceProviderSelf, userId);
          if (cached) return cached.data;
        }
        throw err;
      }
    },
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated && (hasToken || !isOnline) && !isAuthResolving,
    retry: false,
  });
}

/**
 * Derived provider status. Same shape/rationale as useIsSeller
 * (see useSellers.ts) — returns both isProvider and isLoaded since
 * call sites need to distinguish "still loading" from "loaded, not
 * a provider".
 */
export function useIsProvider(): {
  isProvider: boolean;
  isLoaded: boolean;
  showRoleSkeleton: boolean;
} {
  // FIX ROLE-HOOK-GUEST-01: same shape as useIsSeller's fix (see its
  // comment for the full rationale). A logged-out visitor used to get
  // an infinite showRoleSkeleton because useMyServiceProvider is
  // enabled:isAuthenticated and TanStack reports a disabled query as
  // status:'pending'. The correct answer for a guest is definitive:
  // not a provider.
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const { data, isSuccess, isPending } = useMyServiceProvider();
  const lastKnown = useAuthStore((s) => s.lastKnownRoles);
  const setLastKnownRoles = useAuthStore((s) => s.setLastKnownRoles);

  useEffect(() => {
    if (isSuccess && isAuthenticated) {
      setLastKnownRoles({ isProvider: Boolean(data) });
    }
  }, [isSuccess, isAuthenticated, data, setLastKnownRoles]);

  if (!isAuthenticated) {
    return { isProvider: false, isLoaded: true, showRoleSkeleton: false };
  }

  const isLoaded = isSuccess;
  const isProvider = isSuccess ? Boolean(data) : Boolean(lastKnown?.isProvider);
  const showRoleSkeleton = !isSuccess && !lastKnown && isPending;
  return { isProvider, isLoaded, showRoleSkeleton };
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
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.serviceProviders.analyticsForPeriod(period),
    queryFn: () => serviceProvidersApi.getMyAnalytics(period).then((r) => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated && (hasToken || !isOnline),
    retry: false,
  });
}
