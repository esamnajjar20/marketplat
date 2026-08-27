'use client';

import { useQuery } from '@tanstack/react-query';
import { sellersApi } from '@/api/sellers.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';

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
 */
export function useMySellerProfile() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.sellers.me(),
    queryFn: () => sellersApi.getMyProfile().then(r => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
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
export function useIsSeller(): { isSeller: boolean; isLoaded: boolean } {
  const { data, isSuccess } = useMySellerProfile();
  return { isSeller: isSuccess && Boolean(data), isLoaded: isSuccess };
}


/** GET /sellers/me/attention — dashboard "needs attention" counters. */
export function useMyAttention() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.sellers.attention(),
    queryFn: () => sellersApi.getMyAttention().then(r => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated,
    retry: false,
  });
}
