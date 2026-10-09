/**
 * Ad query hooks.
 *
 * FIX T-05: AdSearchParams uses sortBy/sortOrder — passed through directly.
 * FIX C-06: getMyAds calls /ads/me (fixed in ads.api.ts).
 * FIX API-02: useSearchAds calls adsApi.searchAds with 'q' param.
 * FIX Q-03: staleTime unified across all ad queries via CACHE_TTL constants.
 */
// FIX ADS-OFFLINE-CACHE-SCOPE-01: offline cache slots for adsBrowse/myAds
// are only populated for the truly unfiltered first page. Previously a
// filtered page-1 fetch overwrote them.
'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useOfflineListSeed } from '@/lib/useOfflineListSeed';
import { adsApi }    from '@/api/ads.api';
// API-INT-08 FIX: usersApi was imported dynamically inside the queryFn.
// There is no circular dependency between useAds.ts and users.api.ts —
// the dynamic import was carried over from an earlier circular-dep workaround
// that no longer applies. Static import is cleaner and avoids a resolved-but-
// unnecessary Promise on every query execution.
import { usersApi }  from '@/api/users.api';
import { queryKeys } from '@/lib/queryKeys';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { CACHE_TTL } from '@/lib/constants';
import type { AdSearchParams, AdSearchQuery, AdListItem } from '@/types/ad.types';
import { offlineMeta } from '@/lib/apiPagination';
import {
  getOfflineList,
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';


/** GET /ads — paginated + filtered list */
/**
 * FIX PERF-04: SearchResults.tsx calls both useAds() and useSearchAds()
 * unconditionally on every render (Hooks can't be called conditionally),
 * then picks whichever result applies based on isSearch. useSearchAds
 * already guards itself via its own `enabled` (only fires when q.length
 * >= 2), but useAds had no equivalent guard — so on every real search
 * (the by-far most common reason to be on this page), a second, fully
 * wasted GET /ads request fired in parallel with GET /ads/search for
 * no reason, doubling the request count and DB load for that page.
 * The `enabled` option lets a caller like SearchResults opt out
 * (enabled: !isSearch) while every other caller (FeaturedAds, RecentAds)
 * keeps its default always-on behavior unchanged.
 */
export function useAds(
  params?: AdSearchParams,
  options?: {
    enabled?: boolean;
    /** FIX ADS-OFFLINE-CACHE-SCOPE-03: opt out of writing into the
     * shared adsBrowse offline slot even when the request is
     * technically an unfiltered first page. useAdsForHome's general
     * fallback used {limit: 6} to keep the home feed small, but its
     * request still qualified as isBaseBrowse, so visiting Home last
     * left only 6 ads cached under adsBrowse — a later offline open
     * of the full /ads page (normally 20+ per page) then showed those
     * 6 back to the user. The slot is meant for the browse page's own
     * request shape, not for any component that happens to call
     * useAds() with no filters at a smaller limit. */
    disableOfflineCache?: boolean;
  },
) {
  // FIX ADS-OFFLINE-CACHE-SCOPE-01: the comment already said "بدون فلاتر"
  // but the code only checked page — so landing on /search?city=غزة with
  // page 1 wrote the FILTERED result set into the generic adsBrowse
  // offline key. Later, an unfiltered offline open (or a filterless
  // first render online) served those filtered items as if they were
  // "all ads". The same drift class we just closed for paymentStorage,
  // just on a read-mostly path. Now the offline slot is populated only
  // when the request really is the unfiltered first page.
  //
  // FIX ADS-OFFLINE-CACHE-SCOPE-02: the original fix only listed
  // city/categoryId with a comment claiming those were the only
  // discrete filter fields AdSearchParams exposes. That was wrong —
  // AdSearchParams (types/ad.types.ts:141) also carries condition,
  // minPrice, maxPrice, search, userId, storeId, and isFeatured, any
  // of which changes the result set. The bug therefore came back for
  // every one of those: e.g. /search?minPrice=100 still populated the
  // generic adsBrowse slot, so a later offline unfiltered open saw
  // only the ≥100 listings. sortBy/sortOrder are deliberately NOT
  // listed — they change the order of the same set, not which items
  // belong to it.
  const hasRealFilter =
    Boolean(params?.city) ||
    Boolean(params?.categoryId) ||
    Boolean(params?.condition) ||
    params?.minPrice !== undefined ||
    params?.maxPrice !== undefined ||
    Boolean(params?.search) ||
    Boolean(params?.userId) ||
    Boolean(params?.storeId) ||
    params?.isFeatured !== undefined;
  // FIX ADS-OFFLINE-SORT-01: treat non-default sort as a different offline
  // shape — a price-sorted page-1 must not overwrite the default
  // createdAt-desc adsBrowse slot (and vice versa offline).
  const hasNonDefaultSort =
    (params?.sortBy != null && params.sortBy !== 'createdAt') ||
    (params?.sortOrder != null && params.sortOrder !== 'desc');
  // FIX ADS-OFFLINE-CACHE-SCOPE-03: also honor disableOfflineCache — see
  // the option's own comment on the signature above.
  //
  // T760 follow-up — a caller passing `limit` smaller than the default
  // browse page (e.g. a sidebar preview) requests a different SET than
  // the /ads page's own shape, so writing it into adsBrowse would leak
  // a truncated list into the offline browse slot. useAdsForHome
  // already opts out via disableOfflineCache, but a future caller
  // passing {limit: 4} without that flag would have hit this. Adding
  // limit to the guard makes it safe by construction.
  const isBaseBrowse =
    !options?.disableOfflineCache &&
    (!params?.page || params.page === 1) &&
    params?.limit === undefined &&
    !hasRealFilter &&
    !hasNonDefaultSort;
  const queryKey = queryKeys.ads.list(params);
  useOfflineListSeed<AdListItem, { items: AdListItem[]; meta: ReturnType<typeof offlineMeta> }>({
    queryKey,
    cacheKey: OFFLINE_LIST_KEYS.adsBrowse,
    enabled: isBaseBrowse && options?.enabled !== false,
    mapItems: (items) => ({ items, meta: offlineMeta(items.length) }),
  });

  return useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const data = await adsApi.getAll(params).then((r) => r.data.data);
        if (isBaseBrowse && data?.items) {
          saveOfflineList(
            OFFLINE_LIST_KEYS.adsBrowse,
            data.items,
            OFFLINE_LIST_LIMITS.adsBrowse,
          );
        }
        return data;
      } catch (err) {
        if (isBaseBrowse) {
          const local = getOfflineList<AdListItem>(OFFLINE_LIST_KEYS.adsBrowse);
          if (local) {
            return { items: local.items, meta: offlineMeta(local.items.length) };
          }
        }
        throw err;
      }
    },
    placeholderData:  keepPreviousData,
    staleTime:        CACHE_TTL.adsList,
    enabled:          options?.enabled,
  });
}

/** GET /ads/search?q=... — full-text search */
export function useSearchAds(params: AdSearchQuery) {
  return useQuery({
    queryKey:        queryKeys.ads.search(params),
    queryFn:         () => adsApi.searchAds(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
    staleTime:       CACHE_TTL.adsList,
    // API-INT-06 FIX: params.q could be undefined at runtime even though
    // AdSearchQuery types it as string (callers may pass uncontrolled input).
    // .trim() on undefined throws a TypeError that crashes the query.
    //
    // NOTE: kept at >= 2 (not >= 1) to match SearchResults.tsx's own
    // isSearch threshold and the pinned test contract in
    // useAds.test.tsx / SearchResults.test.tsx — a 1-character query
    // falls back to the unfiltered browse query rather than firing a
    // dedicated search request.
    enabled:         (params.q?.trim().length ?? 0) >= 2,
  });
}

/** GET /ads/:id — full ad detail */
export function useAd(id: string) {
  return useQuery({
    queryKey:  queryKeys.ads.detail(id),
    queryFn:   () => adsApi.getById(id).then((r) => r.data.data),
    staleTime: CACHE_TTL.adDetail,
    enabled:   Boolean(id),
  });
}

/** GET /ads/:id/related — FIX API-SHAPE-02: backend returns a bare array, not { items }. */
export function useRelatedAds(id: string) {
  return useQuery({
    queryKey:  queryKeys.ads.related(id),
    queryFn:   () => adsApi.getRelated(id).then((r) => r.data.data ?? []),
    staleTime: CACHE_TTL.adsList,             // FIX Q-03: unified staleTime
    enabled:   Boolean(id),
  });
}

/**
 * GET /ads/me — current user's own listings.
 * FIX C-06: URL is /ads/me (was /ads/my in old code — fixed in ads.api.ts).
 */
export function useMyAds(params?: Pick<AdSearchParams, 'page' | 'limit' | 'status'>, options?: { enabled?: boolean }) {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  // FIX ADS-OFFLINE-CACHE-SCOPE-01 (same as useAds above): a
  // status-filtered first page (e.g. my SOLD ads) was being written
  // into the generic myAds offline slot, so a later unfiltered offline
  // open showed only sold ads under "إعلاناتي".
  const isBase =
    (!params?.page || params.page === 1) &&
    params?.status === undefined;

  return useQuery({
    queryKey:        queryKeys.ads.mine(params),
    queryFn: async () => {
      try {
        const data = await adsApi.getMyAds(params).then((r) => r.data.data);
        if (isBase && data?.items) {
          saveOfflineList(
            OFFLINE_LIST_KEYS.myAds,
            data.items,
            OFFLINE_LIST_LIMITS.myAds,
            userId,
          );
        }
        return data;
      } catch (err) {
        if (isBase) {
          const local = getOfflineList<AdListItem>(OFFLINE_LIST_KEYS.myAds, userId);
          if (local) {
            return { items: local.items, meta: offlineMeta(local.items.length) };
          }
        }
        throw err;
      }
    },
    placeholderData: keepPreviousData,
    staleTime:       CACHE_TTL.myAds,
    enabled:         options?.enabled ?? true,
  });
}

/**
 * GET /ads/me/stats — aggregate dashboard counts (active/sold ads,
 * total views, favorites count). FIX BUG-06/BUG-07: replaces
 * DashboardStats.tsx's previous approach of fetching a page of ads +
 * a page of favorites (capped at 100 each) and reducing them
 * client-side, which silently undercounted for any user past that
 * cap. This is a single real aggregate query server-side — see
 * ads.service.ts's getMyStats — so it's correct at any scale.
 */
export function useMyAdStats() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);

  return useQuery({
    queryKey:  queryKeys.ads.myStats(),
    queryFn:   () => adsApi.getMyStats().then((r) => r.data.data),
    staleTime: CACHE_TTL.myAds,
    // FIX AUTH-401-STORM: never fire without a real access token.
    enabled: isAuthenticated && hasToken,
  });
}

/** GET /users/:id/ads — public ads of another user */
export function useUserAds(userId: string, params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey:  queryKeys.users.ads(userId, params),
    // API-INT-08 FIX: replaced dynamic import() with static usersApi import above.
    queryFn:   () => usersApi.getUserAds(userId, params).then((r) => r.data.data),
    staleTime: CACHE_TTL.adsList,
    enabled:   Boolean(userId),
  });
}
