'use client';

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
import type { SellerAttention } from '@/types/seller.types';
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
