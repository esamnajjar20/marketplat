'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { storesApi } from '@/api/stores.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  getOfflineList,
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { isUnfilteredFirstPage } from '@/lib/offlineCachePolicy';
import type { StoresQuery, StoreDetails, StoreWithSeller } from '@/types/store.types';
import {
  getOfflineJson,
  saveOfflineJson,
  OFFLINE_JSON_KEYS,
} from '@/lib/offlineJsonCache';

/**
 * GET /stores — public directory, paginated.
 *
 * T760 — the offline-cache guard used to check only page/search/city,
 * but StoresQuery also carries `limit` (and sortBy/sortOrder, which
 * don't change the SET, only its order). Home sections
 * (RecentStores/StoresSection/FeaturedStoresSection) call useStores
 * with limit: 4-6, and their result was being written into the
 * shared storesBrowse slot; a later offline open of the full /stores
 * page (which fetches the backend default 20) then served those 4-6
 * back as if they were the whole list. The same class of drift
 * ADS-OFFLINE-CACHE-SCOPE-01/02/03 already closed for ads — this
 * hook was missed then. Switched to the whitelist helper
 * (offlineCachePolicy.isUnfilteredFirstPage) that exists precisely
 * to make future filter fields safe by default (a new field is
 * treated as a filter unless a caller explicitly whitelists it).
 * `page` and `limit` are the two non-filter fields here — `limit`
 * matters because a caller that shrinks the page size is requesting
 * a different result SET from the browse page's own shape.
 */
export function useStores(
  params?: StoresQuery,
  options?: { enabled?: boolean },
) {
  const isBaseBrowse = isUnfilteredFirstPage(params, {
    nonFilterFields: ['page', 'limit'],
  });
  const cached = isBaseBrowse
    ? getOfflineList<StoreWithSeller>(OFFLINE_LIST_KEYS.storesBrowse)
    : null;

  return useQuery({
    queryKey: queryKeys.stores.list(params),
    queryFn: async () => {
      try {
        const data = await storesApi.getAll(params).then((r) => r.data.data);
        if (isBaseBrowse && Array.isArray(data?.items)) {
          saveOfflineList(
            OFFLINE_LIST_KEYS.storesBrowse,
            data.items as StoreWithSeller[],
            OFFLINE_LIST_LIMITS.storesBrowse,
          );
        }
        return data;
      } catch (err) {
        if (isBaseBrowse) {
          const local = getOfflineList<StoreWithSeller>(OFFLINE_LIST_KEYS.storesBrowse);
          if (local) {
            return {
              items: local.items,
              meta: {
                total: local.items.length,
                page: 1,
                limit: local.items.length || 1,
                totalPages: 1,
                hasNextPage: false,
                hasPrevPage: false,
              },
            };
          }
        }
        throw err;
      }
    },
    staleTime: CACHE_TTL.adsList,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
    ...(cached?.items?.length
      ? {
          initialData: {
            items: cached.items,
            meta: {
              total: cached.items.length,
              page: 1,
              limit: cached.items.length || 1,
              totalPages: 1,
              hasNextPage: false,
              hasPrevPage: false,
            },
          },
          initialDataUpdatedAt: new Date(cached.savedAt).getTime(),
        }
      : {}),
  });
}

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
 *
 * FIX OFFLINE-SELLER-GATE-01: same fix as useMySellerProfile (see that
 * hook's comment for the full rationale) — a plain network failure was
 * indistinguishable from a genuine 404, so a real store owner going
 * offline was shown "افتح متجرك أولاً" and blocked from
 * /my-store/products/new. Only a real network failure (statusCode:0,
 * the ParsedError convention client.ts's own retry logic already uses)
 * falls back to the last successfully fetched store; a confirmed 404
 * still blocks as before.
 */
export function useMyStore(options?: { enabled?: boolean }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  // T770 — user-scoped.
  const userId = useAuthStore((s) => s.user?.id ?? null);

  return useQuery({
    queryKey: queryKeys.stores.me(),
    queryFn: async () => {
      try {
        const data = await storesApi.getMyStore().then((r) => r.data.data);
        if (data) saveOfflineJson(OFFLINE_JSON_KEYS.storeSelf, data, userId);
        return data;
      } catch (err) {
        const isNetworkFailure = (err as { statusCode?: number })?.statusCode === 0;
        if (isNetworkFailure) {
          const cached = getOfflineJson<StoreDetails>(OFFLINE_JSON_KEYS.storeSelf, userId);
          if (cached) return cached.data;
        }
        throw err;
      }
    },
    staleTime: CACHE_TTL.sellerProfile,
    enabled: (options?.enabled ?? true) && isAuthenticated && (hasToken || !isOnline),
    retry: false,
  });
}

/**
 * GET /stores/me/analytics — owner-only. See StoreAnalytics's doc
 * comment (types/store.types.ts) for why there's no orders/revenue/
 * conversion field: this backend has no Order model yet.
 */
export function useMyStoreAnalytics() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.stores.analytics(),
    queryFn: () => storesApi.getMyStoreAnalytics().then((r) => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated && (hasToken || !isOnline),
    retry: false,
  });
}

/** GET /stores/me/followed — the caller's followed stores, paginated. */
export function useMyFollowedStores(params?: { page?: number; limit?: number }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.stores.followed(params),
    queryFn: () => storesApi.getMyFollowedStores(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.favorites,
    enabled: isAuthenticated && (hasToken || !isOnline),
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
  }, [query.data, queryClient]);

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
 * 100, matching the useFavorites({ limit: 100 }) convention already
 * used elsewhere) and checks membership reactively against the shared
 * cache Set, which useToggleStoreFollow keeps in sync on every
 * successful toggle.
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
