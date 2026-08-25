/**
 * useToggleFavorite — optimistically toggles an ad's favorite status.
 *
 * FIX H-06: queryKeys.favorites.ids() holds a Set<string> (populated by
 * useFavorites.ts), but this optimistic updater previously read/wrote it
 * typed as string[] and called .includes()/.filter() on it — methods a
 * Set doesn't have. Once a real Set landed in the cache (after visiting
 * any page that calls useFavorites()), every toggle threw a TypeError
 * inside the onMutate updater. Fixed by using Set methods consistently.
 */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { favoritesApi }  from '@/api/favorites.api';
import { queryKeys }     from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast }         from 'sonner';
import type { FavoriteEntityKind } from '@/types/favorite.types';

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (adId: string) =>
      favoritesApi.toggle(adId).then((r) => r.data.data),

    onMutate: async (adId: string) => {
      const previousIds = queryClient.getQueryData<Set<string>>(queryKeys.favorites.ids());

      // Optimistic toggle of the favorites ID set — written before the
      // cancelQueries await below so it's visible synchronously to any
      // code checking the cache right after mutate() is called.
      queryClient.setQueryData<Set<string>>(queryKeys.favorites.ids(), (old) => {
        const next = new Set(old ?? []);
        if (next.has(adId)) {
          next.delete(adId);
        } else {
          next.add(adId);
        }
        return next;
      });

      // Cancel any in-flight favorites queries to avoid a stale refetch
      // clobbering the optimistic write above.
      await queryClient.cancelQueries({ queryKey: ['favorites'] });

      return { previousIds };
    },

    onError: (err, _adId, context) => {
      if (context?.previousIds !== undefined) {
        queryClient.setQueryData(queryKeys.favorites.ids(), context.previousIds);
      }
      toast.error(parseApiError(err).message);
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
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
    mutationFn: (entityId: string) =>
      favoritesApi.toggleEntity(type, entityId).then((r) => r.data.data),

    onMutate: async (entityId: string) => {
      const previousIds = queryClient.getQueryData<Set<string>>(
        queryKeys.favorites.entityIds(type),
      );

      queryClient.setQueryData<Set<string>>(queryKeys.favorites.entityIds(type), (old) => {
        const next = new Set(old ?? []);
        if (next.has(entityId)) {
          next.delete(entityId);
        } else {
          next.add(entityId);
        }
        return next;
      });

      await queryClient.cancelQueries({ queryKey: ['favorites', 'entity-list', type] });

      return { previousIds };
    },

    onError: (err, _entityId, context) => {
      if (context?.previousIds !== undefined) {
        queryClient.setQueryData(queryKeys.favorites.entityIds(type), context.previousIds);
      }
      toast.error(parseApiError(err).message);
    },

    onSettled: (_data, _err, entityId) => {
      queryClient.invalidateQueries({ queryKey: ['favorites', 'entity-list', type] });
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites.entityCheck(type, entityId) });
    },
  });
}
