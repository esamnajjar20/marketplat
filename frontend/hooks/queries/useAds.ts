/**
 * Ad query hooks.
 *
 * FIX T-05: AdSearchParams uses sortBy/sortOrder — passed through directly.
 * FIX C-06: getMyAds calls /ads/me (fixed in ads.api.ts).
 * FIX API-02: useSearchAds calls adsApi.searchAds with 'q' param.
 * FIX Q-03: staleTime unified across all ad queries via CACHE_TTL constants.
 */
'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { adsApi }    from '@/api/ads.api';
// API-INT-08 FIX: usersApi was imported dynamically inside the queryFn.
// There is no circular dependency between useAds.ts and users.api.ts —
// the dynamic import was carried over from an earlier circular-dep workaround
// that no longer applies. Static import is cleaner and avoids a resolved-but-
// unnecessary Promise on every query execution.
import { usersApi }  from '@/api/users.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import type { AdSearchParams, AdSearchQuery } from '@/types/ad.types';

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
export function useAds(params?: AdSearchParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey:         queryKeys.ads.list(params),
    queryFn:          () => adsApi.getAll(params).then((r) => r.data.data),
    placeholderData:  keepPreviousData,      // prevents flash when changing pages
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
export function useMyAds(params?: Pick<AdSearchParams, 'page' | 'limit' | 'status'>) {
  return useQuery({
    queryKey:        queryKeys.ads.mine(params),
    queryFn:         () => adsApi.getMyAds(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
    staleTime:       CACHE_TTL.myAds,
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
