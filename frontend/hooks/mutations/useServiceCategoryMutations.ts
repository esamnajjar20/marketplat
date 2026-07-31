/**
 * EPIC 1.2: admin service-category mutations. Mirrors
 * useCategoryMutations.ts exactly. The backend
 * (POST/PATCH/DELETE /service-categories, all requireAdmin-protected)
 * was already fully implemented — only the frontend client and these
 * hooks were missing, matching the report's finding for this section.
 */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceCategoriesApi } from '@/api/service-categories.api';
import { queryKeys }            from '@/lib/queryKeys';
import { parseApiError }        from '@/lib/errorParser';
import { toast }                from 'sonner';
import type { CreateServiceCategoryPayload, UpdateServiceCategoryPayload } from '@/types/service.types';

/**
 * A create/update/delete here affects both the admin-only tree (this
 * hook file's own queries) and the public-facing category tree used
 * across the services section (useServiceCategories's `all` key) — both
 * must be invalidated together, or the public tree would keep showing
 * stale data until its own CACHE_TTL.categories staleTime lapses.
 */
function invalidateServiceCategoryQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.serviceCategories.adminAll() });
  queryClient.invalidateQueries({ queryKey: queryKeys.serviceCategories.all() });
}

export function useCreateServiceCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateServiceCategoryPayload) =>
      serviceCategoriesApi.create(payload).then((r) => r.data.data),
    onSuccess: () => {
      invalidateServiceCategoryQueries(queryClient);
      toast.success('تم إنشاء فئة الخدمة');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useUpdateServiceCategory(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateServiceCategoryPayload) =>
      serviceCategoriesApi.update(id, payload).then((r) => r.data.data),
    onSuccess: () => {
      invalidateServiceCategoryQueries(queryClient);
      toast.success('تم حفظ التعديلات');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useDeleteServiceCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => serviceCategoriesApi.delete(id),
    onSuccess: () => {
      invalidateServiceCategoryQueries(queryClient);
      toast.success('تم حذف الفئة');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * EPIC 1.2 (Epic 1.3 dependency note): toggling isActive uses the same
 * update endpoint as name/slug edits (PATCH /service-categories/:id
 * already accepts isActive per service-categories.validation.ts's
 * updateServiceCategorySchema) — no separate endpoint needed. Exposed
 * as its own hook for a one-click toggle button, distinct from the
 * full edit dialog.
 */
export function useToggleServiceCategoryActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      serviceCategoriesApi.update(id, { isActive }).then((r) => r.data.data),
    onMutate: async ({ id, isActive }) => {
      const key = queryKeys.serviceCategories.adminAll();
      const snapshot = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old: any) => {
        if (!old) return old;
        const patchOne = (c: any) => (c.id === id ? { ...c, isActive } : c);
        return old.map((c: any) => ({ ...patchOne(c), children: c.children?.map(patchOne) }));
      });
      await queryClient.cancelQueries({ queryKey: key });
      return { snapshot };
    },
    onSuccess: (_data, { isActive }) =>
      toast.success(isActive ? 'تم تفعيل الفئة' : 'تم إخفاء الفئة'),
    onError: (err, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(queryKeys.serviceCategories.adminAll(), context.snapshot);
      }
      toast.error(parseApiError(err).message);
    },
    onSettled: () => invalidateServiceCategoryQueries(queryClient),
  });
}
