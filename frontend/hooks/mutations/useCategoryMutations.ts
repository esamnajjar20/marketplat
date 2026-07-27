/**
 * FIX FEAT-03: admin category mutations. The backend (POST/PATCH/DELETE
 * /categories, all requireAdmin-protected) and categoriesApi (the
 * frontend API layer) were both already correctly implemented and
 * wired to each other — only CreateCategoryButton.tsx was never updated
 * to actually call them, using a `setTimeout` placeholder instead.
 */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriesApi } from '@/api/categories.api';
import { queryKeys }     from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast }         from 'sonner';
import type { CreateCategoryPayload, UpdateCategoryPayload } from '@/types/category.types';

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateCategoryPayload) =>
      categoriesApi.create(payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all() });
      toast.success('تم إنشاء الفئة');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useUpdateCategory(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateCategoryPayload) =>
      categoriesApi.update(id, payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all() });
      toast.success('تم حفظ التعديلات');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => categoriesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all() });
      toast.success('تم حذف الفئة');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
