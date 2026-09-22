/**
 * Favorites query hooks.
 *
 * FIX H-05 (superseded): useIsFavorited was originally built as a pure
 *           derivation off a shared Set<string> (queryKeys.favorites.ids())
 *           because no per-ad check endpoint existed. GET
 *           /favorites/:adId/check now exists (UX-FIX, frontend audit
 *           P2-03) and is used by useFavoriteCheck() below for
 *           single-ad views — but the Set/useIsFavorited() pattern is
 *           kept as-is for grid/list views (search results, home page,
 *           my-ads), where one request per visible card would be a
 *           real regression, not an improvement.
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
import type { FavoriteEntityKind } from '@/types/favorite.types';

/** GET /favorites — paginated list of the user's favorited ads */
export function useFavorites(params?: { page?: number; limit?: number; listId?: string }) {
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
  // though it genuinely was. Fixed for grid/list contexts (search
  // results, home page, my-ads) by merging every settled fetch's ids
  // into the existing Set instead of only ever writing page 1. For a
  // single ad's status (e.g. one ad detail page), use
  // useFavoriteCheck(adId) instead of paging through the whole list —
  // see its doc comment; that's what AdDetailSection.tsx does.
  useEffect(() => {
    const data = query.data;
    if (!data) return;

    // FIX FAVORITES-EFFECT-RERENDER: كان Set جديد يُنشأ كل refetch حتى
    // لو نفس البيانات → re-render لكل AdCard subscribers عبر
    // useIsFavorited. الآن: defensive على fav.ad.id + early return
    // لو ما فيه جديد.
    const newIds = data.items
      .map((fav) => fav?.ad?.id)
      .filter((id): id is string => typeof id === 'string');
    if (newIds.length === 0) return;

    const prev = queryClient.getQueryData<Set<string>>(queryKeys.favorites.ids());
    if (prev && newIds.every((id) => prev.has(id))) return;

    queryClient.setQueryData<Set<string>>(queryKeys.favorites.ids(), (existing) => {
      const idSet = new Set(existing ?? []);
      newIds.forEach((id) => idSet.add(id));
      return idSet;
    });
  }, [query.data, queryClient]);

  return query;
}

/**
 * Seeds the shared favorites.ids() Set with a single ad's status via
 * GET /favorites/:adId/check. UX-FIX (frontend audit P2-03): replaces
 * AdDetailSection.tsx's previous useFavorites({ limit: 100 }) call,
 * which fetched the user's full favorites list (the backend's max page
 * size) just to warm the Set for one ad — and was silently wrong for
 * any ad favorited past page 1 of >100 favorites. Writes into the same
 * favorites.ids() Set useIsFavorited() already reads and
 * useToggleFavorite() already keeps in sync, so toggling still works
 * exactly as before — this only changes how the Set gets seeded for a
 * single-ad view, not how it's read or mutated.
 */
export function useFavoriteCheck(adId: string) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const queryClient     = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.favorites.check(adId),
    queryFn:  () => favoritesApi.check(adId),
    staleTime: CACHE_TTL.favorites,
    enabled:   isAuthenticated && Boolean(adId),
  });

  // Same API-INT-07 reasoning as useFavorites above: side effect lives
  // in useEffect on the settled result, not in queryFn itself.
  useEffect(() => {
    if (query.data === undefined) return;
    if (!query.data) return; // false: nothing to add, and don't risk
                              // clobbering a concurrent optimistic add.

    queryClient.setQueryData<Set<string>>(queryKeys.favorites.ids(), (prev) => {
      const idSet = new Set(prev ?? []);
      idSet.add(adId);
      return idSet;
    });
  }, [query.data, adId, queryClient]);

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

  // HYDRATION FIX (#418): starting from the cache snapshot on the
  // client produced isFavorited=true for favorited ads while the SSR
  // pass (empty queryClient) rendered false — the heart's className
  // and aria-pressed flipped on hydration. Starting at false keeps the
  // initial render byte-identical to the server; the effect below
  // already syncs to the real value on mount.
  const [isFavorited, setIsFavorited] = useState<boolean>(false);

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

/**
 * FEAT-FAVORITE-POLYMORPHIC PR3: generic counterpart of useFavorites()
 * above, for GET /favorites?type=product|store|service. Same
 * page-1-only-fetch / merge-into-a-shared-Set shape as useFavorites,
 * but keyed per entity type (queryKeys.favorites.entityIds(type))
 * instead of the single AD-only ids() Set, so a product id and a
 * store id can never collide.
 */
export function useFavoritesByType<T>(
  type: FavoriteEntityKind,
  params?: { page?: number; limit?: number; listId?: string },
) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const queryClient     = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.favorites.entityList(type, params),
    queryFn:  () => favoritesApi.getAllByType<T>(type, params).then((r) => r.data.data),
    staleTime: CACHE_TTL.favorites,
    enabled:   isAuthenticated,
  });

  useEffect(() => {
    const data = query.data;
    if (!data) return;

    // FIX FAVORITES-EFFECT-RERENDER (نفس useFavorites)
    const newIds = data.items
      .map((fav) => fav?.entityId)
      .filter((id): id is string => typeof id === 'string');
    if (newIds.length === 0) return;

    const prev = queryClient.getQueryData<Set<string>>(queryKeys.favorites.entityIds(type));
    if (prev && newIds.every((id) => prev.has(id))) return;

    queryClient.setQueryData<Set<string>>(queryKeys.favorites.entityIds(type), (existing) => {
      const idSet = new Set(existing ?? []);
      newIds.forEach((id) => idSet.add(id));
      return idSet;
    });
  }, [query.data, queryClient, type]);

  return query;
}

/**
 * Seeds the shared entityIds(type) Set with a single entity's status
 * via GET /favorites/:segment/:entityId/check — generic counterpart of
 * useFavoriteCheck() above, used by single-entity views (e.g.
 * StoreHeader, ServiceListingDetail) instead of paging through the
 * whole per-type favorites list just to check one entity.
 *
 * `enabled` lets a caller that only wants the reactive Set-based
 * useIsEntityFavorited() below (card grids — one request per visible
 * card would be a real regression) skip the network call entirely by
 * passing false, while still calling this hook unconditionally
 * (rules-of-hooks — see FavoriteButton.tsx).
 */
export function useFavoriteEntityCheck(
  type: FavoriteEntityKind,
  entityId: string,
  enabled: boolean = true,
) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const queryClient     = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.favorites.entityCheck(type, entityId),
    queryFn:  () => favoritesApi.checkEntity(type, entityId),
    staleTime: CACHE_TTL.favorites,
    enabled:   isAuthenticated && Boolean(entityId) && enabled,
  });

  useEffect(() => {
    if (query.data === undefined) return;
    if (!query.data) return; // false: nothing to add, don't clobber a concurrent optimistic add.

    queryClient.setQueryData<Set<string>>(queryKeys.favorites.entityIds(type), (prev) => {
      const idSet = new Set(prev ?? []);
      idSet.add(entityId);
      return idSet;
    });
  }, [query.data, type, entityId, queryClient]);

  return query;
}

/**
 * Direct accessor for a type's favorited-entity IDs Set from cache.
 * Non-reactive — use useIsEntityFavorited() for reactive per-entity checks.
 */
export function getFavoriteEntityIdsSnapshot(
  queryClient: ReturnType<typeof useQueryClient>,
  type: FavoriteEntityKind,
): Set<string> {
  return queryClient.getQueryData<Set<string>>(queryKeys.favorites.entityIds(type)) ?? new Set();
}

/**
 * Generic counterpart of useIsFavorited() above, for
 * products/stores/service listings. Subscribes to
 * entityIds(type)'s cache entry the same way useIsFavorited
 * subscribes to ids() — does NOT create a second query with the same
 * key. Returns `false` for a logged-out user or before the Set has
 * been populated, same "no special-cased loading state for a heart
 * icon" contract as useIsFavorited.
 */
export function useIsEntityFavorited(type: FavoriteEntityKind, entityId: string): boolean {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const queryClient = useQueryClient();

  const [isFavorited, setIsFavorited] = useState<boolean>(() =>
    getFavoriteEntityIdsSnapshot(queryClient, type).has(entityId),
  );

  useEffect(() => {
    if (!isAuthenticated) {
      setIsFavorited(false);
      return;
    }

    setIsFavorited(getFavoriteEntityIdsSnapshot(queryClient, type).has(entityId));

    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      const key = event.query.queryKey;
      const idsKey = queryKeys.favorites.entityIds(type);
      if (key.length !== idsKey.length || key.some((k: unknown, i: number) => k !== idsKey[i])) return;

      setIsFavorited(getFavoriteEntityIdsSnapshot(queryClient, type).has(entityId));
    });

    return unsubscribe;
  }, [type, entityId, isAuthenticated, queryClient]);

  return isFavorited;
}
