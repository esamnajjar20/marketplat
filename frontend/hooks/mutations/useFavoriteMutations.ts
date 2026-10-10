/**
 * useToggleFavorite — optimistically toggles an ad's favorite status.
 *
 * queryKeys.favorites.ids() holds a Set<string> (populated by
 * useFavorites.ts), but this optimistic updater previously read/wrote it
 * typed as string[] and called .includes()/.filter() on it — methods a
 * Set doesn't have. Once a real Set landed in the cache (after visiting
 * any page that calls useFavorites()), every toggle threw a TypeError
 * inside the onMutate updater. by using Set methods consistently.
 */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { favoritesApi }  from '@/api/favorites.api';
import { queryKeys }     from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast }         from 'sonner';
import type { FavoriteEntityKind } from '@/types/favorite.types';
import { runSerializedMutation } from '@/lib/serialMutationQueue';
import { getSessionCleanupVersion } from '@/lib/authCleanup';

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['favorite-toggle', 'ad'],
    mutationFn: (adId: string) =>
      runSerializedMutation(JSON.stringify(['favorite', getSessionCleanupVersion(), 'ad', adId]), () =>
        favoritesApi.toggle(adId).then((r) => r.data.data),
      ),

    onMutate: async (adId: string) => {
      // T793-bis — cancelQueries MUST precede the snapshot + write.
      // The previous order (snapshot → write → cancel) allowed an
      // in-flight ['favorites'] refetch to resolve AFTER the optimistic
      // Set write and overwrite it with the pre-toggle server value —
      // visible as the heart icon flipping back for a beat before
      // onSettled's invalidate restored it. The old comment claimed
      // writing before the await made the write "synchronously
      // visible" after mutate(), but TanStack Query v5's mutate()
      // returns immediately regardless of onMutate and no caller reads
      // the cache synchronously right after it — the justification
      // was incorrect.
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites.all() });
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites.check(adId) });
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites.ids() });

      const previousIds = queryClient.getQueryData<Set<string>>(queryKeys.favorites.ids());
      const wasFavorite = previousIds?.has(adId) ?? false;
      const optimisticFavorite = !wasFavorite;

      queryClient.setQueryData<Set<string>>(queryKeys.favorites.ids(), (old) => {
        const next = new Set(old ?? []);
        if (optimisticFavorite) next.add(adId);
        else next.delete(adId);
        return next;
      });

      // No rollback snapshot is retained: a toggle's prior state can already
      // be obsolete by the time its request fails. Reconcile after the last
      // pending toggle instead of restoring historical state.
      return undefined;
    },

    onError: (err, _adId) => {
      const parsed = parseApiError(err);
      // FEAT-OFFLINE-FAVORITES: a queued mutation (sw.js's offline
      // mutation queue — see client.ts's OFFLINE_QUEUED rejection) is
      // not a real failure, it's the SW faithfully promising to send
      // this exact toggle once connectivity returns. Rolling back the
      // optimistic Set here would visually undo the user's tap while
      // the request is still pending, not failed — exactly the
      // "toggle offline, sync later" behaviour the app is supposed to
      // give (❤️ → محليًا فورًا → Offline: يدخل Queue، لا يُلغى).
      // A historical rollback is unsafe when newer clicks for the same ID
      // already changed the optimistic state. The last pending mutation
      // reconciles with the server in onSettled instead.
      toast.error(parsed.message);
    },

    onSettled: (_data, error, adId) => {
      // isMutating includes the mutation currently settling. Defer invalidation
      // until the last ad toggle finishes to avoid intermediate responses
      // overwriting a newer optimistic state. Keep queued offline toggles local.
      const parsed = error ? parseApiError(error) : null;
      if (parsed?.queued) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.favorites.check(adId) });
      if (queryClient.isMutating({ mutationKey: ['favorite-toggle', 'ad'] }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.favorites.listRoot() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.favorites.ids() });
    },
  });
}

/**
 * FEAT-FAVORITE-POLYMORPHIC PR3: generic counterpart of
 * useToggleFavorite() above, for products/stores/service listings.
 * Returns a factory-built mutation scoped to one entity type — same
 * optimistic Set toggle/rollback shape as useToggleFavorite, but
 * reading/writing entityIds(type) instead of the AD-only ids() Set,
 * and invalidating only that type's own queries on settle (this
 * type's entity list + entity check) rather than the whole
 * ['favorites'] prefix — toggling a favorited product has no reason
 * to refetch the user's favorited ads or stores.
 */
export function useToggleFavoriteEntity(type: FavoriteEntityKind) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['favorite-toggle', type],
    mutationFn: (entityId: string) =>
      runSerializedMutation(JSON.stringify(['favorite', getSessionCleanupVersion(), type, entityId]), () =>
        favoritesApi.toggleEntity(type, entityId).then((r) => r.data.data),
      ),

    onMutate: async (entityId: string) => {
      // T793-bis — same cancel-first requirement as useToggleFavorite
      // above (which see). Applies equally here: an in-flight
      // ['favorites','entity-list',type] refetch resolving between
      // the write and the (previously) late cancelQueries would
      // overwrite the optimistic Set.
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites.entityListRoot(type) });
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites.entityCheck(type, entityId) });

      const previousIds = queryClient.getQueryData<Set<string>>(
        queryKeys.favorites.entityIds(type),
      );
      const wasFavorite = previousIds?.has(entityId) ?? false;
      const optimisticFavorite = !wasFavorite;

      queryClient.setQueryData<Set<string>>(queryKeys.favorites.entityIds(type), (old) => {
        const next = new Set(old ?? []);
        if (optimisticFavorite) next.add(entityId);
        else next.delete(entityId);
        return next;
      });

      // Avoid retaining a stale rollback snapshot for a non-idempotent toggle.
      // The final pending mutation reconciles the cache with server state.
      return undefined;
    },

    onError: (err, _entityId) => {
      const parsed = parseApiError(err);
      // FEAT-OFFLINE-FAVORITES: same reasoning as useToggleFavorite's
      // onError above — a queued offline mutation isn't a real
      // failure, so don't undo the optimistic toggle for it.
      // Toggle snapshots can be stale when the same entity has newer pending
      // clicks. Reconcile once the final mutation in this type settles.
      toast.error(parsed.message);
    },

    onSettled: (_data, error, entityId) => {
      const parsed = error ? parseApiError(error) : null;
      if (parsed?.queued) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.favorites.entityCheck(type, entityId) });
      if (queryClient.isMutating({ mutationKey: ['favorite-toggle', type] }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.favorites.entityListRoot(type) });
    },
  });
}
