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
import type { CreateProductCategoryPayload, UpdateProductCategoryPayload, ProductCategory } from '@/types/product.types';
import { toastMutationError } from '@/lib/mutationFeedback';

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
    onError: toastMutationError,
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
    onError: toastMutationError,
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
    onError: toastMutationError,
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
    mutationKey: ['product-category-active'],
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      productCategoriesApi.update(id, { isActive }).then((r) => r.data.data),
    onMutate: async ({ id, isActive }) => {
      // T793-ter — cancelQueries MUST precede the snapshot + write.
      // The previous order let an in-flight adminAll refetch resolve
      // AFTER the recursive tree patch and overwrite it with the
      // pre-toggle values. Especially visible here because patchOne
      // walks the whole tree recursively (see FIX RECURSIVE-TREE-PATCH
      // below) — a slower write widens the race window.
      const key = queryKeys.productCategories.adminAll();
      await queryClient.cancelQueries({ queryKey: key });
      const snapshot = queryClient.getQueryData<ProductCategory[]>(key);
      queryClient.setQueryData<ProductCategory[]>(key, (old) => {
        if (!old) return old;
        // FIX RECURSIVE-TREE-PATCH: ProductCategory.children is
        // typed ProductCategory[] (recursive), not a fixed
        // two-level tree — the previous patch only descended one
        // level, so a toggled grandchild looked unchanged until
        // the onSettled refetch landed. Walk the whole tree.
        const patchOne = (c: ProductCategory): ProductCategory => ({
          ...(c.id === id ? { ...c, isActive } : c),
          children: c.children?.map(patchOne),
        });
        return old.map(patchOne);
      });
      const findPreviousActive = (categories: ProductCategory[] | undefined): boolean | undefined => {
        if (!categories) return undefined;
        for (const category of categories) {
          if (category.id === id) return category.isActive;
          const nested = findPreviousActive(category.children);
          if (nested !== undefined) return nested;
        }
        return undefined;
      };
      return { snapshot, previousActive: findPreviousActive(snapshot) };
    },
    onSuccess: (_data, { isActive }) =>
      toast.success(isActive ? 'تم تفعيل الفئة' : 'تم إخفاء الفئة'),
    onError: (err, _vars, context) => {
      const parsed = parseApiError(err);
      // FIX CATEGORY-QUEUED-ROLLBACK: an offline-queued mutation
      // (sw.js's 202 {queued:true}) arrives here with
      // parsed.queued=true — same non-failure that the favorites
      // hook already skips rollback for. Without this, an admin
      // toggling a category while offline saw the checkbox flip
      // back to its old state immediately, then flip again once
      // the SW replay actually landed — pure noise.
      const anotherToggleForSameCategoryIsPending = queryClient.isMutating({
        predicate: (mutation) =>
          mutation.options.mutationKey?.[0] === 'product-category-active' &&
          (mutation.state.variables as { id?: string } | undefined)?.id === _vars.id,
      }) > 1;
      if (!parsed.queued && !anotherToggleForSameCategoryIsPending && context?.previousActive !== undefined) {
        // Roll back only the category this mutation touched. Restoring the
        // entire tree snapshot can erase optimistic changes to other categories
        // when two admin toggles are in flight at the same time.
        const key = queryKeys.productCategories.adminAll();
        queryClient.setQueryData<ProductCategory[]>(key, (current) => {
          if (!current) return current;
          const restoreOne = (category: ProductCategory): ProductCategory => ({
            ...category,
            ...(category.id === _vars.id ? { isActive: context.previousActive } : {}),
            children: category.children?.map(restoreOne),
          });
          return current.map(restoreOne);
        });
      }
      toast.error(parsed.message);
    },
    onSettled: () => invalidateProductCategoryQueries(queryClient),
  });
}
