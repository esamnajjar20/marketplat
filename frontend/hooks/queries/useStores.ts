'use client';

import { useQuery } from '@tanstack/react-query';
import { storesApi } from '@/api/stores.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import type { StoresQuery } from '@/types/store.types';

/** GET /stores — public directory, paginated. */
export function useStores(params?: StoresQuery) {
  return useQuery({
    queryKey: queryKeys.stores.list(params),
    queryFn: () => storesApi.getAll(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.adsList,
  });
}

/** GET /stores/:id — public store page. No auth required. */
export function useStore(id: string) {
  return useQuery({
    queryKey: queryKeys.stores.detail(id),
    queryFn: () => storesApi.getById(id).then((r) => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: Boolean(id),
  });
}

/**
 * GET /stores/me — the caller's own store.
 * A 404 here just means "no store yet", not an error state — same
 * convention as useMyServiceProvider: callers should treat `isError`
 * (with no data) as "show a create-a-store CTA".
 */
export function useMyStore() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.stores.me(),
    queryFn: () => storesApi.getMyStore().then((r) => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated,
    retry: false,
  });
}

/** GET /stores/me/followed — the caller's followed stores, paginated. */
export function useMyFollowedStores(params?: { page?: number; limit?: number }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.stores.followed(params),
    queryFn: () => storesApi.getMyFollowedStores(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.favorites,
    enabled: isAuthenticated,
  });
}
