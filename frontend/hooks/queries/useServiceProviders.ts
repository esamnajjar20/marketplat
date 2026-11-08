'use client';

import { throwIfQueryCancelled } from '@/lib/queryCancellation';

import { useEffect } from 'react';

import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { serviceProvidersApi, type ServiceProviderDashboardData, type ServiceProviderDashboardParams } from '@/api/service-providers.api';
import { serviceListingsApi } from '@/api/service-listings.api';
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
import { normalizeMyServicesWorkspaceParams } from '@/lib/myServicesWorkspace';
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
    queryFn: ({ signal }) => serviceProvidersApi.getAll(params, { signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.adsList,
    enabled: options?.enabled,
  });
}

/** GET /service-providers/:id — public provider page. No auth required. */
export function useServiceProvider(id: string) {
  return useQuery({
    queryKey: queryKeys.serviceProviders.detail(id),
    queryFn: ({ signal }) => serviceProvidersApi.getById(id, { signal }).then((r) => r.data.data),
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
    queryFn: async ({ signal }) => {
      try {
        const data = await serviceProvidersApi.getMyProvider({ signal }).then((r) => r.data.data);
        if (data) saveOfflineJson(OFFLINE_JSON_KEYS.serviceProviderSelf, data, userId);
        return data;
      } catch (err) {
        throwIfQueryCancelled(err, signal);
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
 * Combines the two independent /my-services overview reads (analytics + own
 * listings) while reusing provider identity from /users/me/bootstrap.
 * The query is user-scoped and receives canonical URL filters so the hub and
 * list components deduplicate to the same in-flight request.
 */
export function useMyServiceProviderDashboard(
  params: ServiceProviderDashboardParams,
  options?: { enabled?: boolean },
) {
  const queryClient = useQueryClient();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isAuthResolving = useAuthStore(selectIsAuthResolving);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const normalizedParams = normalizeMyServicesWorkspaceParams(params);
  const period = params.period ?? 'all';

  return useQuery<ServiceProviderDashboardData>({
    queryKey: queryKeys.serviceProviders.workspaceDashboard(
      userId ?? 'anonymous',
      period,
      normalizedParams,
    ),
    queryFn: async ({ signal }) => {
      const analyticsKey = queryKeys.serviceProviders.analyticsForPeriod(userId ?? 'anonymous', period);
      const analyticsState = queryClient.getQueryState(analyticsKey);
      const cachedAnalytics = queryClient.getQueryData<ServiceProviderDashboardData['analytics']>(analyticsKey);
      const analyticsIsFresh = Boolean(
        cachedAnalytics
        && analyticsState
        && !analyticsState.isInvalidated
        && Date.now() - analyticsState.dataUpdatedAt < CACHE_TTL.sellerProfile,
      );

      try {
        // A URL-only list change should not recompute seven analytics reads.
        // Reuse fresh user-scoped analytics and fetch only the changed page.
        if (analyticsIsFresh && cachedAnalytics) {
          const listings = await serviceListingsApi.getMine(normalizedParams, { signal });
          return { analytics: cachedAnalytics, listings: listings.data.data! };
        }

        const data = await serviceProvidersApi.getMyDashboard(
          { ...normalizedParams, period },
          { signal },
        ).then((r) => r.data.data);
        if (!data) throw new Error('Dashboard data is empty');
        queryClient.setQueryData(analyticsKey, data.analytics);
        return data;
      } catch (err) {
        throwIfQueryCancelled(err, signal);
        const isNetworkFailure = (err as { statusCode?: number })?.statusCode === 0;
        if (isNetworkFailure) {
          const cachedAnalytics = queryClient.getQueryData(analyticsKey);
          const cachedListings = queryClient.getQueryData(
            queryKeys.serviceListings.mine(normalizedParams),
          );
          if (cachedAnalytics && cachedListings) {
            return {
              analytics: cachedAnalytics as ServiceProviderDashboardData['analytics'],
              listings: cachedListings as ServiceProviderDashboardData['listings'],
            };
          }
        }
        throw err;
      }
    },
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated && (hasToken || !isOnline) && !isAuthResolving && (options?.enabled ?? true),
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
    queryFn: ({ signal }) => serviceProvidersApi.getNearby(params!, { signal }).then((r) => r.data.data),
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
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();

  return useQuery<ServiceProviderAnalytics>({
    queryKey: queryKeys.serviceProviders.analyticsForPeriod(userId ?? 'anonymous', period),
    queryFn: ({ signal }) => serviceProvidersApi.getMyAnalytics(period, { signal }).then((r) => r.data.data),
    // Keep the last selected period visible while the next period loads.
    // This avoids replacing the entire analytics panel with a spinner when
    // switching between 7d / 30d / all; the component labels the transition.
    placeholderData: keepPreviousData,
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated && (hasToken || !isOnline),
    retry: false,
  });
}
