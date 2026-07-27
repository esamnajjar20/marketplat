/**
 * Favorites query hooks.
 *
 * FIX H-05: useIsFavorited replaced with a derivation approach.
 *           We maintain a Set<string> of favorited ad IDs in the cache
 *           (queryKeys.favorites.ids). This is populated from the list response
 *           and updated optimistically by useToggleFavorite.
 *
 *           No extra API call needed — no non-existent /check endpoint.
 *
 * API-INT-07 FIX: queryFn must be a pure function — no side effects.
 *   Previously, queryFn called queryClient.setQueryData() to populate the
 *   favorites IDs Set. Side effects in queryFn run on EVERY retry and on
 *   every background refetch, which could corrupt the IDs Set mid-flight
 *   (e.g. if a retry fires while useToggleFavorite is doing an optimistic update).
 *
 *   Fixed by using useEffect on the query result to populate the IDs Set
 *   only after a successful, settled response.
 */
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { favoritesApi } from '@/api/favorites.api';
import { queryKeys }    from '@/lib/queryKeys';
import { CACHE_TTL }    from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';

/** GET /favorites — paginated list of the user's favorited ads */
export function useFavorites(params?: { page?: number; limit?: number }) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const queryClient     = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.favorites.all(params),
    // API-INT-07 FIX: pure queryFn — no side effects.
    queryFn:  () => favoritesApi.getAll(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.favorites,
    enabled:   isAuthenticated,
  });

  // API-INT-07 FIX: populate the IDs Set as a side effect AFTER the query settles.
  // This runs only when data changes (successful fetch), not on retries in-flight.
  //
  // FIX TYPE-01 / BUG: `data.items` is FavoriteRecord[] — Favorite rows with
  // the ad nested under `.ad` — not AdListItem[] directly. This used to map
  // over `data.items` as `ad` and read `ad.id`, which is actually the
  // Favorite row's own id, not the ad's id. The Set ended up full of
  // favorite-record ids that never match any real ad id, so
  // useIsFavorited(adId) below could never find a match — the heart icon
  // on ad detail pages showed "not saved" for every ad, even ones actually
  // favorited. Fixed to read the real ad id at `.ad.id`.
  //
  // FIX H-BUG-01: only page 1's ids were ever written into the shared
  // favorites.ids() Set. Any favorited ad living beyond page 1 (and not
  // separately paged into the cache elsewhere) was invisible to
  // useIsFavorited(), so its heart icon rendered as "not saved" even
  // though it genuinely was. There's no per-ad GET /favorites/:adId/check
  // endpoint (removed per FIX H-05), so the only way to keep the Set
  // complete without a new backend endpoint is for every settled fetch —
  // regardless of which page was requested — to merge its ids into the
  // existing Set instead of only ever writing page 1 and discarding the
  // rest. Callers that want the whole list up front (e.g. any screen that
  // just needs "is this favorited" everywhere) should call
  // useFavorites({ limit: 100 }) — the backend's max page size — the same
  // pattern already used by DashboardStats' MAX_ADS_FOR_STATS fix.
  useEffect(() => {
    const data = query.data;
    if (!data) return;

    queryClient.setQueryData<Set<string>>(queryKeys.favorites.ids(), (prev) => {
      const idSet = new Set(prev ?? []);
      data.items.forEach((fav) => idSet.add(fav.ad.id));
      return idSet;
    });
  }, [query.data, queryClient]);

  return query;
}

/**
 * Direct accessor for the favorites IDs Set from cache.
 * Non-reactive — use useIsFavorited() hook for reactive per-ad checks.
 * Useful for reading the set in non-component contexts.
 */
export function getFavoriteIdsSnapshot(
  queryClient: ReturnType<typeof useQueryClient>,
): Set<string> {
  return queryClient.getQueryData<Set<string>>(queryKeys.favorites.ids()) ?? new Set();
}

/**
 * FIX H-06: useIsFavorited was referenced in comments here and in
 * queryKeys.ts but never actually implemented, leaving per-card
 * "is this favorited" UI with no working reactive source.
 *
 * This subscribes directly to the existing favorites.ids() cache entry
 * (populated by useFavorites' useEffect) via the query cache's own
 * subscription mechanism — it does NOT create a second query with the
 * same key, which would risk clobbering the real Set with a dummy
 * initialData under certain mount/refetch orderings.
 *
 * Returns `false` (not "unknown") if the user is logged out or the
 * favorites Set hasn't been populated yet — callers don't need to
 * special-case a loading state for a heart icon.
 */
export function useIsFavorited(adId: string): boolean {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const queryClient = useQueryClient();

  const [isFavorited, setIsFavorited] = useState<boolean>(() =>
    getFavoriteIdsSnapshot(queryClient).has(adId),
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setIsFavorited(false);
      return;
    }

    // Sync immediately on mount/adId change in case the cache already
    // has a value (e.g. navigated here after favorites were loaded
    // elsewhere).
    setIsFavorited(getFavoriteIdsSnapshot(queryClient).has(adId));

    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      const key = event.query.queryKey;
      const idsKey = queryKeys.favorites.ids();
      if (key.length !== idsKey.length || key.some((k: unknown, i: number) => k !== idsKey[i])) return;

      setIsFavorited(getFavoriteIdsSnapshot(queryClient).has(adId));
    });

    return unsubscribe;
  }, [adId, isAuthenticated, queryClient]);

  return isFavorited;
}
