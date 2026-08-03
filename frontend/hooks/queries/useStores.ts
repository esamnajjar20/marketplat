'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.stores.followed(params),
    queryFn: () => storesApi.getMyFollowedStores(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.favorites,
    enabled: isAuthenticated,
  });

  // FIX BUG-03: mirrors useFavorites' H-05/API-INT-07 fix exactly — merge
  // this page's followed store ids into the shared followedIds() Set as a
  // pure side effect after the query settles, so useIsFollowingStore()
  // below has something to read reactively without a per-store network
  // call (there's no GET /stores/:id/follow-status endpoint).
  useEffect(() => {
    const data = query.data;
    if (!data) return;

    queryClient.setQueryData<Set<string>>(queryKeys.stores.followedIds(), (prev) => {
      const idSet = new Set(prev ?? []);
      data.items.forEach((row) => idSet.add(row.storeId));
      return idSet;
    });
  }, [query.data]);

  return query;
}

/**
 * Direct accessor for the followed-store IDs Set from cache.
 * Non-reactive — use useIsFollowingStore() for reactive per-store checks.
 */
export function getFollowedStoreIdsSnapshot(
  qc: ReturnType<typeof useQueryClient>,
): Set<string> {
  return qc.getQueryData<Set<string>>(queryKeys.stores.followedIds()) ?? new Set();
}

/**
 * FIX BUG-03: StoreHeader (components/stores/StoreHeader.tsx) always
 * accepted an `isFollowing` prop but no caller ever passed one — the
 * store detail page (app/(public)/stores/[id]/page.tsx) only rendered
 * `<StoreHeader store={store} />`, so the button showed "متابعة" for
 * every user regardless of their actual follow state, and clicking it
 * on a store they already followed silently unfollowed them without
 * the UI ever indicating that had happened.
 *
 * There is no single-store "am I following this" endpoint, so — same
 * reasoning and shape as useIsFavorited — this fetches the full
 * followed-stores list once (capped at the backend's max page size of
 * 100, matching the MAX_ADS_FOR_STATS / useFavorites({ limit: 100 })
 * convention already used elsewhere) and checks membership reactively
 * against the shared cache Set, which useToggleStoreFollow keeps in
 * sync on every successful toggle.
 */
export function useIsFollowingStore(storeId: string): boolean {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const queryClient = useQueryClient();
  useMyFollowedStores({ limit: 100 });

  const [isFollowing, setIsFollowing] = useState<boolean>(() =>
    getFollowedStoreIdsSnapshot(queryClient).has(storeId),
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setIsFollowing(false);
      return;
    }

    setIsFollowing(getFollowedStoreIdsSnapshot(queryClient).has(storeId));

    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      const key = event.query.queryKey;
      const idsKey = queryKeys.stores.followedIds();
      if (key.length !== idsKey.length || key.some((k: unknown, i: number) => k !== idsKey[i])) return;

      setIsFollowing(getFollowedStoreIdsSnapshot(queryClient).has(storeId));
    });

    return unsubscribe;
  }, [storeId, isAuthenticated, queryClient]);

  return isFollowing;
}
