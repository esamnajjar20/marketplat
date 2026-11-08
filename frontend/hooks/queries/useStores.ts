'use client';

import { useEffect } from 'react';
import { useOfflineListSeed } from '@/lib/useOfflineListSeed';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
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
  selectIsAuthResolving,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { isUnfilteredFirstPage } from '@/lib/offlineCachePolicy';
import { useFollowStatus } from '@/hooks/queries/useFollows';
import { clearVisitedPublicStore, getVisitedPublicStore, saveVisitedPublicStore } from '@/lib/offlineVisitedPublicEntities';
import type { StoresQuery, StoreDetails, StoreDirectoryItem } from '@/types/store.types';
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
  // Only the API's default page size belongs in the shared full-browse slot.
  // Home teasers pass a smaller explicit limit and have their own snapshot.
  const isBaseBrowse = params?.limit === undefined && isUnfilteredFirstPage(params);
  const queryKey = queryKeys.stores.list(params);
  const isHomeSnapshot = params?.limit === 6 && params?.sortBy === 'createdAt' && params?.sortOrder === 'desc'
    && !params?.page && !params?.search && !params?.city && !params?.type;
  useOfflineListSeed<StoreDirectoryItem, Awaited<ReturnType<typeof storesApi.getAll>>['data']['data']>({
    queryKey,
    cacheKey: OFFLINE_LIST_KEYS.homeStores,
    enabled: isHomeSnapshot && (options?.enabled ?? true),
    mapItems: (items: StoreDirectoryItem[]) => ({
      items,
      meta: { total: items.length, page: 1, limit: items.length || 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    }),
  });
  useOfflineListSeed<StoreDirectoryItem, Awaited<ReturnType<typeof storesApi.getAll>>['data']['data']>({
    queryKey,
    cacheKey: OFFLINE_LIST_KEYS.storesBrowse,
    enabled: isBaseBrowse && (options?.enabled ?? true),
    mapItems: (items: StoreDirectoryItem[]) => ({
      items,
      meta: { total: items.length, page: 1, limit: items.length || 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    }),
  });

  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      try {
        const data = await storesApi.getAll(params, { signal }).then((r) => r.data.data);
        if (isBaseBrowse && Array.isArray(data?.items)) {
          saveOfflineList(
            OFFLINE_LIST_KEYS.storesBrowse,
            data.items as StoreDirectoryItem[],
            OFFLINE_LIST_LIMITS.storesBrowse,
          );
        }
        return data;
      } catch (err) {
        // React Query cancellation is intentional; never turn it into stale offline data.
        if (signal.aborted) throw err;
        if (isBaseBrowse) {
          const local = getOfflineList<StoreDirectoryItem>(OFFLINE_LIST_KEYS.storesBrowse);
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
  });
}

export function useStore(id: string, options: { enabled?: boolean; trackView?: boolean } = {}) {
  // The aggregate payload includes private viewer flags. Scope the cache by
  // identity so a logout/account switch can never reuse another user's flags.
  const viewerId = useAuthStore((state) => state.user?.id ?? null);
  const queryKey = [...queryKeys.stores.detail(id), 'viewer', viewerId ?? 'anonymous', 'trackView', Boolean(options.trackView)] as const;
  return useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      try {
        const pageData = await storesApi.getPageData(id, {
          signal,
          ...(options.trackView ? { params: { trackView: true } } : {}),
        }).then((r) => r.data.data);
        if (pageData?.store?.id && pageData.store.status === 'ACTIVE') saveVisitedPublicStore(id, pageData.store);
        else clearVisitedPublicStore(id);
        return pageData;
      } catch (error) {
        if (signal.aborted) throw error;
        const status = typeof error === 'object' && error !== null
          ? Number((error as { statusCode?: number; response?: { status?: number } }).statusCode
            ?? (error as { response?: { status?: number } }).response?.status)
          : 0;
        // Never resurrect a deleted/forbidden listing from an offline copy.
        if ([401, 403, 404, 410].includes(status)) {
          if ([403, 404, 410].includes(status)) clearVisitedPublicStore(id);
          throw error;
        }
        const cached = getVisitedPublicStore(id);
        // The saved store is public data only. Do not invent user-specific
        // follow/favorite flags while offline; supplementary badges may be
        // omitted until the aggregate endpoint is reachable again.
        if (cached) return { store: cached, badges: [], viewer: null };
        throw error;
      }
    },
    staleTime: CACHE_TTL.sellerProfile,
    enabled: Boolean(id) && (options.enabled ?? true),
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
  const isAuthResolving = useAuthStore(selectIsAuthResolving);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  // T770 — user-scoped.
  const userId = useAuthStore((s) => s.user?.id ?? null);

  const query = useQuery({
    queryKey: queryKeys.stores.me(),
    queryFn: async ({ signal }) => {
      try {
        const data = await storesApi.getMyStore({ signal }).then((r) => r.data.data);
        if (data) saveOfflineJson(OFFLINE_JSON_KEYS.storeSelf, data, userId);
        return data;
      } catch (err) {
        // Preserve cancellation semantics before attempting an offline fallback.
        if (signal.aborted) throw err;
        const isNetworkFailure = (err as { statusCode?: number })?.statusCode === 0;
        if (isNetworkFailure) {
          const cached = getOfflineJson<StoreDetails>(OFFLINE_JSON_KEYS.storeSelf, userId);
          if (cached) return cached.data;
        }
        throw err;
      }
    },
    staleTime: CACHE_TTL.sellerProfile,
    enabled: (options?.enabled ?? true) && isAuthenticated && (hasToken || !isOnline) && !isAuthResolving,
    retry: false,
  });

  // Keep the already-persisted role/capability hint in sync with the
  // store query that the protected navigation already uses. This is a
  // side effect of an existing query — it does NOT create another request.
  // Only a confirmed store response can mark the capability true; a
  // confirmed 404 means there is no store. Other errors leave the last
  // known value untouched so a transient network failure never hides an
  // existing store.
  const setLastKnownRoles = useAuthStore((s) => s.setLastKnownRoles);
  useEffect(() => {
    if (query.data) {
      setLastKnownRoles({ hasActiveStore: query.data.status === 'ACTIVE' });
      return;
    }

    const statusCode = (query.error as { statusCode?: number } | null)?.statusCode;
    if (query.isError && statusCode === 404) {
      setLastKnownRoles({ hasActiveStore: false });
    }
  }, [query.data, query.error, query.isError, setLastKnownRoles]);

  return query;
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
    queryFn: ({ signal }) => storesApi.getMyStoreAnalytics({ signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.sellerProfile,
    enabled: isAuthenticated && (hasToken || !isOnline),
    retry: false,
  });
}

/** GET /stores/me/followed — the caller's followed stores, paginated. */
export function useMyFollowedStores(params?: Parameters<typeof storesApi.getMyFollowedStores>[0]) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.stores.followed(params),
    queryFn: ({ signal }) => storesApi.getMyFollowedStores(params, { signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.favorites,
    enabled: isAuthenticated && (hasToken || !isOnline),
  });
}

/**
 * StoreHeader's viewer-specific follow state. Use the existing single-target
 * status endpoint instead of fetching the complete followed-stores list just
 * to answer one boolean question. The mutation writes the same query key so
 * the button updates immediately after follow/unfollow succeeds.
 */
export function useIsFollowingStore(storeId: string): boolean {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  // A store detail page needs one membership bit, not the caller's entire
  // followed-store collection. The generic status endpoint already supports
  // targetType=STORE and performs a single-row lookup on the backend.
  const { data: following = false } = useFollowStatus('STORE', storeId);
  return isAuthenticated && following;
}
