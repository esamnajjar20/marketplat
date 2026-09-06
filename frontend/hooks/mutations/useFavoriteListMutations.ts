'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { favoriteListsApi } from '@/api/favorite-lists.api';
import { favoriteListsQueryKey } from '@/hooks/queries/useFavoriteLists';
import { queryKeys } from '@/lib/queryKeys';
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
      qc.invalidateQueries({ queryKey: queryKeys.favorites.all() });
      toast.success('تم حذف القائمة (العناصر بقيت في «الكل»)');
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
      qc.invalidateQueries({ queryKey: queryKeys.favorites.all() });
      toast.success('تم نقل العنصر');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
