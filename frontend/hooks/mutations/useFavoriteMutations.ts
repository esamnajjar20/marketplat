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
