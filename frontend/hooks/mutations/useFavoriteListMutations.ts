'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { favoriteListsApi } from '@/api/favorite-lists.api';
import { favoriteListsQueryKey } from '@/hooks/queries/useFavoriteLists';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';

export function useCreateFavoriteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => favoriteListsApi.create({ name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: favoriteListsQueryKey });
      toast.success('تم إنشاء القائمة');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useRenameFavoriteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, name }: { listId: string; name: string }) =>
      favoriteListsApi.rename(listId, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: favoriteListsQueryKey });
      toast.success('تم تعديل الاسم');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useDeleteFavoriteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) => favoriteListsApi.remove(listId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: favoriteListsQueryKey });
      qc.invalidateQueries({ queryKey: queryKeys.favorites.listRoot() });
      toast.success('تم حذف القائمة (العناصر بقيت في «الكل»)');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useMoveFavoritesToList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ favoriteIds, listId }: { favoriteIds: string[]; listId: string | null }) => {
      const CONCURRENCY = 4;
      let ok = 0;
      let fail = 0;
      for (let i = 0; i < favoriteIds.length; i += CONCURRENCY) {
        const batch = favoriteIds.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((favoriteId) => favoriteListsApi.moveFavorite(favoriteId, { listId })),
        );
        for (const result of results) {
          if (result.status === 'fulfilled') ok += 1;
          else fail += 1;
        }
      }
      return { ok, fail, total: favoriteIds.length };
    },
    onSuccess: ({ ok, fail, total }) => {
      qc.invalidateQueries({ queryKey: favoriteListsQueryKey });
      qc.invalidateQueries({ queryKey: queryKeys.favorites.listRoot() });
      if (fail === total && total > 0) {
        toast.error('تعذر نقل العناصر المحددة');
      } else {
        toast.success(fail > 0 ? `نُقل ${ok} عنصر · فشل ${fail}` : `نُقل ${ok} عنصر`);
      }
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useMoveFavoriteToList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      favoriteId,
      listId,
    }: {
      favoriteId: string;
      listId: string | null;
    }) => favoriteListsApi.moveFavorite(favoriteId, { listId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: favoriteListsQueryKey });
      qc.invalidateQueries({ queryKey: queryKeys.favorites.listRoot() });
      toast.success('تم نقل العنصر');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
