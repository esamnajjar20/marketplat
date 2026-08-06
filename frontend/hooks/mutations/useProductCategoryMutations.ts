/**
 * Admin product-category mutations. Mirrors
 * useServiceCategoryMutations.ts exactly. The backend
 * (POST/PATCH/DELETE /product-categories, all requireAdmin-protected)
 * was already fully implemented — only the frontend UI (this hook plus
 * the tree/buttons/page it powers) was missing, closing the audit
 * report's finding for this section (mirrors the earlier EPIC 1.2 fix
 * that did the same for service-categories).
 */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { productCategoriesApi } from '@/api/product-categories.api';
import { queryKeys }            from '@/lib/queryKeys';
import { parseApiError }        from '@/lib/errorParser';
import { toast }                from 'sonner';
import type { CreateProductCategoryPayload, UpdateProductCategoryPayload } from '@/types/product.types';

/**
 * A create/update/delete here affects both the admin-only tree (this
 * hook file's own queries) and the public-facing category tree used
 * across the products section (useProductCategories's `all` key) —
 * both must be invalidated together, or the public tree would keep
 * showing stale data until its own CACHE_TTL.categories staleTime
 * lapses.
 */
function invalidateProductCategoryQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.productCategories.adminAll() });
  queryClient.invalidateQueries({ queryKey: queryKeys.productCategories.all() });
}

export function useCreateProductCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateProductCategoryPayload) =>
      productCategoriesApi.create(payload).then((r) => r.data.data),
    onSuccess: () => {
      invalidateProductCategoryQueries(queryClient);
      toast.success('تم إنشاء فئة المنتج');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useUpdateProductCategory(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateProductCategoryPayload) =>
      productCategoriesApi.update(id, payload).then((r) => r.data.data),
    onSuccess: () => {
      invalidateProductCategoryQueries(queryClient);
      toast.success('تم حفظ التعديلات');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useDeleteProductCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => productCategoriesApi.delete(id),
    onSuccess: () => {
      invalidateProductCategoryQueries(queryClient);
      toast.success('تم حذف الفئة');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * Toggling isActive uses the same update endpoint as name/slug edits
 * (PATCH /product-categories/:id already accepts isActive per
 * product-categories.validation.ts's updateProductCategorySchema) — no
 * separate endpoint needed. Exposed as its own hook for a one-click
 * toggle button, distinct from the full edit dialog. Mirrors
 * useToggleServiceCategoryActive's optimistic-update pattern exactly.
 */
export function useToggleProductCategoryActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      productCategoriesApi.update(id, { isActive }).then((r) => r.data.data),
    onMutate: async ({ id, isActive }) => {
      const key = queryKeys.productCategories.adminAll();
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
        queryClient.setQueryData(queryKeys.productCategories.adminAll(), context.snapshot);
      }
      toast.error(parseApiError(err).message);
    },
    onSettled: () => invalidateProductCategoryQueries(queryClient),
  });
}
