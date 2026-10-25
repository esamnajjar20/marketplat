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

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { favoritesApi } from '@/api/favorites.api';
import { queryKeys }    from '@/lib/queryKeys';
import { CACHE_TTL }    from '@/lib/constants';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { FavoriteEntityKind } from '@/types/favorite.types';
import { getOfflineFavoriteIntent } from '@/lib/offlineFavoriteIntents';


// Shared reactive bridge for favorite-id Sets. A card must subscribe to the
// Set value, not directly to QueryCache. The registry keeps one QueryCache
// listener per QueryClient/query-key regardless of how many cards consume it.
type FavoriteSetStore = {
  listeners: Set<() => void>;
  unsubscribeCache: (() => void) | null;
  getSnapshot: () => Set<string>;
  subscribe: (listener: () => void) => () => void;
};

const favoriteStores = new WeakMap<object, Map<string, FavoriteSetStore>>();

function getFavoriteSetStore(queryClient: ReturnType<typeof useQueryClient>, queryKey: readonly unknown[]): FavoriteSetStore {
  let stores = favoriteStores.get(queryClient);
  if (!stores) {
    stores = new Map();
    favoriteStores.set(queryClient, stores);
  }

  const key = JSON.stringify(queryKey);
  const existing = stores.get(key);
  if (existing) return existing;

  const store: FavoriteSetStore = {
    listeners: new Set<() => void>(),
    unsubscribeCache: null,
    getSnapshot: () => queryClient.getQueryData<Set<string>>(queryKey) ?? EMPTY_SET,
    subscribe: () => () => {},
  };

  store.subscribe = (listener: () => void) => {
    store.listeners.add(listener);
    if (!store.unsubscribeCache) {
      store.unsubscribeCache = queryClient.getQueryCache().subscribe((event) => {
        const eventKey = event.query.queryKey;
        if (eventKey.length !== queryKey.length || eventKey.some((part: unknown, i: number) => part !== queryKey[i])) return;
        for (const subscriber of store.listeners) subscriber();
      });
    }

    return () => {
      store.listeners.delete(listener);
      if (store.listeners.size === 0 && store.unsubscribeCache) {
        store.unsubscribeCache();
        store.unsubscribeCache = null;
        stores?.delete(key);
      }
    };
  };

  stores.set(key, store);
  return store;
}

const EMPTY_SET = new Set<string>();

function useFavoriteSetMembership(queryClient: ReturnType<typeof useQueryClient>, queryKey: readonly unknown[], entityId: string, enabled: boolean): boolean {
  const store = useMemo(() => getFavoriteSetStore(queryClient, queryKey), [queryClient, queryKey]);
  const subscribe = useMemo(() => (listener: () => void) => enabled ? store.subscribe(listener) : () => {}, [store, enabled]);
  const getSnapshot = useMemo(() => () => enabled ? store.getSnapshot().has(entityId) : false, [store, entityId, enabled]);
  const getServerSnapshot = useMemo(() => () => false, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** GET /favorites — paginated list of the user's favorited ads */
export function useFavorites(params?: Parameters<typeof favoritesApi.getAll>[0]) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const queryClient     = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.favorites.all(params),
    // API-INT-07 FIX: pure queryFn — no side effects.
    queryFn:  ({ signal }) => favoritesApi.getAll(params, { signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.favorites,
    enabled:   isAuthenticated && (hasToken || !isOnline),
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
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const queryClient     = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.favorites.check(adId),
    queryFn:  ({ signal }) => favoritesApi.check(adId, { signal }),
    staleTime: CACHE_TTL.favorites,
    enabled:   isAuthenticated && Boolean(adId) && (hasToken || !isOnline),
  });

  // Same API-INT-07 reasoning as useFavorites above: side effect lives
  // in useEffect on the settled result, not in queryFn itself.
  useEffect(() => {
    if (query.data === undefined) return;

    // A negative server check is authoritative unless a toggle for this
    // exact ad is still pending. Without the delete branch, a stale positive
    // ID could survive indefinitely after the user unfavorited the ad on
    // another device/session. The mutation guard preserves a newer local tap.
    const hasPendingToggle = queryClient.getMutationCache().getAll().some((mutation) =>
      mutation.state.status === 'pending' &&
      mutation.options.mutationKey?.[0] === 'favorite-toggle' &&
      mutation.options.mutationKey?.[1] === 'ad' &&
      mutation.state.variables === adId,
    );
    if (hasPendingToggle) return;

    queryClient.setQueryData<Set<string>>(queryKeys.favorites.ids(), (prev) => {
      const next = new Set(prev ?? []);
      if (query.data) next.add(adId);
      else next.delete(adId);
      if (prev && prev.size === next.size && [...prev].every((id) => next.has(id))) return prev;
      return next;
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
  const queryKey = useMemo(() => queryKeys.favorites.ids(), []);
  useEffect(() => {
    if (!isAuthenticated || !adId) return;
    let active = true;
    void getOfflineFavoriteIntent(useAuthStore.getState().user?.id ?? null, 'AD', adId).then((intent) => {
      if (!active || !intent) return;
      queryClient.setQueryData<Set<string>>(queryKey, (prev) => {
        const next = new Set(prev ?? []);
        if (intent.desired) next.add(adId); else next.delete(adId);
        return next;
      });
    }).catch((error) => console.warn('[offline-favorites] local override read failed', error));
    return () => { active = false; };
  }, [isAuthenticated, adId, queryClient, queryKey]);
  return useFavoriteSetMembership(queryClient, queryKey, adId, isAuthenticated);
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
  params?: Parameters<typeof favoritesApi.getAllByType>[1],
) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const queryClient     = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.favorites.entityList(type, params),
    queryFn:  ({ signal }) => favoritesApi.getAllByType<T>(type, params, { signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.favorites,
    enabled:   isAuthenticated && (hasToken || !isOnline),
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
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const queryClient     = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.favorites.entityCheck(type, entityId),
    queryFn:  ({ signal }) => favoritesApi.checkEntity(type, entityId, { signal }),
    staleTime: CACHE_TTL.favorites,
    enabled:   isAuthenticated && Boolean(entityId) && enabled && (hasToken || !isOnline),
  });

  useEffect(() => {
    if (query.data === undefined) return;

    // Keep entity favorite Sets in sync with authoritative negative checks,
    // but never let a background check undo a local toggle still in flight.
    const hasPendingToggle = queryClient.getMutationCache().getAll().some((mutation) =>
      mutation.state.status === 'pending' &&
      mutation.options.mutationKey?.[0] === 'favorite-toggle' &&
      mutation.options.mutationKey?.[1] === type &&
      mutation.state.variables === entityId,
    );
    if (hasPendingToggle) return;

    queryClient.setQueryData<Set<string>>(queryKeys.favorites.entityIds(type), (prev) => {
      const next = new Set(prev ?? []);
      if (query.data) next.add(entityId);
      else next.delete(entityId);
      if (prev && prev.size === next.size && [...prev].every((id) => next.has(id))) return prev;
      return next;
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
  const queryKey = useMemo(() => queryKeys.favorites.entityIds(type), [type]);
  useEffect(() => {
    if (!isAuthenticated || !entityId) return;
    let active = true;
    void getOfflineFavoriteIntent(useAuthStore.getState().user?.id ?? null, type, entityId).then((intent) => {
      if (!active || !intent) return;
      queryClient.setQueryData<Set<string>>(queryKey, (prev) => {
        const next = new Set(prev ?? []);
        if (intent.desired) next.add(entityId); else next.delete(entityId);
        return next;
      });
    }).catch((error) => console.warn('[offline-favorites] local override read failed', error));
    return () => { active = false; };
  }, [isAuthenticated, entityId, type, queryClient, queryKey]);
  return useFavoriteSetMembership(queryClient, queryKey, entityId, isAuthenticated);
}
