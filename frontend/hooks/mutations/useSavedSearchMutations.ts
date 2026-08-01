'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { savedSearchesApi } from '@/api/savedSearches.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';
import type { CreateSavedSearchInput } from '@/types/savedSearch.types';

export function useCreateSavedSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSavedSearchInput) => savedSearchesApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedSearches.all() });
      toast.success('تم حفظ البحث — سنُعلمك عند وجود إعلان مطابق');
    },
    onError: (err) => {
      toast.error(parseApiError(err).message);
    },
  });
}

export function useDeleteSavedSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => savedSearchesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedSearches.all() });
      toast.success('تم حذف البحث المحفوظ');
    },
    onError: (err) => {
      toast.error(parseApiError(err).message);
    },
  });
}
