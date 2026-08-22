'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { savedSearchesApi } from '@/api/savedSearches.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';
import type { CreateSavedSearchInput } from '@/types/savedSearch.types';

const SUCCESS_TOAST: Record<'ads' | 'products' | 'services', string> = {
  ads: 'تم حفظ البحث — سنُعلمك عند وجود إعلان مطابق',
  products: 'تم حفظ البحث — سنُعلمك عند وجود منتج مطابق',
  services: 'تم حفظ البحث — سنُعلمك عند وجود خدمة مطابقة',
};

export function useCreateSavedSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSavedSearchInput) => savedSearchesApi.create(input),
    // PLATFORM-WIDE-01: `variables` is the same CreateSavedSearchInput
    // passed to mutate(), so its filters.type tells us which toast
    // copy fits — previously hardcoded to the ads wording ("إعلان
    // مطابق") even when SaveSearchButton was called with
    // type="products"/"services".
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedSearches.all() });
      toast.success(SUCCESS_TOAST[variables.filters?.type ?? 'ads']);
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
