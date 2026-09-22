'use client';

import { useEffect } from 'react';

import { useQuery } from '@tanstack/react-query';
import { sellersApi } from '@/api/sellers.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { SellerAttention, SellerProfile } from '@/types/seller.types';
import {
  getOfflineJson,
  saveOfflineJson,
  OFFLINE_JSON_KEYS,
} from '@/lib/offlineJsonCache';

/** GET /sellers/:id — public seller page. No auth required. */
export function useSellerProfile(id: string) {
  return useQuery({
    queryKey: queryKeys.sellers.detail(id),
    queryFn: () => sellersApi.getById(id).then(r => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: Boolean(id),
  });
}

/**
 * GET /sellers/me/profile — the caller's own seller profile.
 * A 404 here just means "not a seller yet", not an error state — every
 * caller of this hook should treat `isError` (with no profile) as
 * "show a become-a-seller CTA", not as a failure to surface.
 *
 * FIX OFFLINE-SELLER-GATE-01: previously had zero offline handling — a
 * plain network failure (no cached fallback at all) looked identical to
 * a genuine 404 to every caller (CreateAdGate, useIsSeller, nav
 * components), so a real seller who went offline was shown "أنشئ ملف
 * البائع أولاً" and blocked from /ads/create even though they already
 * have a seller profile — the exact same class of bug already fixed
 * once for auth session state (AuthHydrationProvider) and applied here
 * to seller-profile state instead. Mirrors useMyAttention's own
 * cache-on-success / fall-back-on-failure pattern below, with one
 * addition specific to this hook: apiClient's response interceptor
 * (client.ts) already runs every rejection through parseApiError
 * before it reaches here, so the caught error is a ParsedError, not a
 * raw AxiosError — statusCode:0 is that layer's own signal for "no
 * server response at all" (offline/DNS/connection-refused), the same
 * convention client.ts's own refresh-retry logic already uses. A
 * genuine 404 (statusCode 404 — confirmed, from the server, "this user
 * really has no SellerProfile") must NOT fall back to a stale cached
 * profile: that's the one case this gate is actually supposed to block
 * for. Only a real network failure falls back to cache.
 */
export function useMySellerProfile() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.sellers.me(),
    queryFn: async () => {
      try {
        const data = await sellersApi.getMyProfile().then(r => r.data.data);
        if (data) saveOfflineJson(OFFLINE_JSON_KEYS.sellerProfileSelf, data);
        return data;
      } catch (err) {
        const isNetworkFailure = (err as { statusCode?: number })?.statusCode === 0;
        if (isNetworkFailure) {
          const cached = getOfflineJson<SellerProfile>(OFFLINE_JSON_KEYS.sellerProfileSelf);
          if (cached) return cached.data;
        }
        throw err;
      }
    },
    staleTime: CACHE_TTL.sellerProfile,
    // HYDRATION-DEDUP: without this, every mount of a component that
    // reads useMySellerProfile (SellerVerificationBanner,
    // BecomeStoreOwnerCard, BecomeServiceProviderCard, OnboardingChecklist)
    // fired its own fetch of /sellers/me/profile before the cache was
    // populated — a mount race that showed up as profile x2 in the
    // Network panel on every protected route. Fresh data is still
    // fetched on a genuinely cold cache; re-mounts read the cache
    // instead of refetching. Explicit invalidation from
    // useSellerMutations still triggers an update after edits.
    refetchOnMount: false,
    enabled: isAuthenticated,
    retry: false,
  });
}

/**
 * Derived seller status, centralising the `isSuccess && Boolean(data)`
 * check duplicated across 7 nav/layout components.
 *
 * Returns both `isSeller` and `isLoaded` (not just a boolean) because
 * call sites need both signals: `isLoaded` alone gates a loading-flash
 * guard (`if (!isLoaded) return null`) and drives the "no profile yet
 * but query resolved" CTA (`isLoaded && !isSeller`), which is a
 * different condition from "still loading".
 */
export function useIsSeller(): {
  isSeller: boolean;
  isLoaded: boolean;
  /** True while the query has no answer yet and no local role hint */
  showRoleSkeleton: boolean;
} {
  // FIX ROLE-HOOK-GUEST-01: a logged-out visitor used to get
  // showRoleSkeleton = true forever. useMySellerProfile is
  // enabled:isAuthenticated -- TanStack reports a disabled query as
  // status:'pending' / fetchStatus:'idle', so isPending stayed true,
  // isSuccess stayed false, and a brand-new guest has no lastKnownRoles
  // to short-circuit on. Any of the 7 nav/layout consumers that
  // render `if (showRoleSkeleton) return <Skeleton />` therefore
  // showed an infinite skeleton where the "become a seller" CTA
  // belonged. A guest is conclusively not a seller: answer that
  // definitively rather than leaving the caller guessing.
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const { data, isSuccess, isPending } = useMySellerProfile();
  const lastKnown = useAuthStore((s) => s.lastKnownRoles);
  const setLastKnownRoles = useAuthStore((s) => s.setLastKnownRoles);

  useEffect(() => {
    // Guard on isAuthenticated too -- otherwise a logout (which flips
    // isSuccess stale-true for one render in some TanStack versions)
    // could briefly write isSeller:false over the real last-known value.
    if (isSuccess && isAuthenticated) {
      setLastKnownRoles({ isSeller: Boolean(data) });
    }
  }, [isSuccess, isAuthenticated, data, setLastKnownRoles]);

  if (!isAuthenticated) {
    return { isSeller: false, isLoaded: true, showRoleSkeleton: false };
  }

  const isLoaded = isSuccess;
  // Prefer server truth; while pending, paint from lastKnownRoles (slow-net).
  const isSeller = isSuccess ? Boolean(data) : Boolean(lastKnown?.isSeller);
  const showRoleSkeleton = !isSuccess && !lastKnown && isPending;
  return { isSeller, isLoaded, showRoleSkeleton };
}


/** GET /sellers/me/attention — dashboard "needs attention" counters. */
export function useMyAttention() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const cached = getOfflineJson<SellerAttention>(
    OFFLINE_JSON_KEYS.dashboardAttention,
  );

  return useQuery<SellerAttention>({
    queryKey: queryKeys.sellers.attention(),
    queryFn: async (): Promise<SellerAttention> => {
      try {
        const data = await sellersApi
          .getMyAttention()
          .then((r) => r.data.data);

        if (data) {
          saveOfflineJson(OFFLINE_JSON_KEYS.dashboardAttention, data);
        }

        if (!data) throw new Error('Seller attention response is empty');
        return data;
      } catch (err) {
        const local = getOfflineJson<SellerAttention>(
          OFFLINE_JSON_KEYS.dashboardAttention,
        );

        if (local) return local.data;

        throw err;
      }
    },
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated && (hasToken || !isOnline),
    retry: false,
    ...(cached
      ? {
          initialData: cached.data,
          initialDataUpdatedAt: new Date(cached.savedAt).getTime(),
        }
      : {}),
  });
}
