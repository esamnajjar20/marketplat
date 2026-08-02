'use client';

import { useQuery } from '@tanstack/react-query';
import { productCategoriesApi } from '@/api/product-categories.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

/** All product categories. Long cache — admin-managed taxonomy, changes rarely. */
export function useProductCategories() {
  return useQuery({
    queryKey: queryKeys.productCategories.all(),
    queryFn: () => productCategoriesApi.getAll().then((r) => r.data.data),
    staleTime: CACHE_TTL.categories,
  });
}

export function useProductCategoryBySlug(slug: string) {
  return useQuery({
    queryKey: queryKeys.productCategories.slug(slug),
    queryFn: () => productCategoriesApi.getBySlug(slug).then((r) => r.data.data),
    staleTime: CACHE_TTL.categories,
    enabled: Boolean(slug),
  });
}

/** GET /product-categories/admin/all — always live, uncached (matches backend). */
export function useProductCategoriesForAdmin() {
  return useQuery({
    queryKey: queryKeys.productCategories.adminAll(),
    queryFn: () => productCategoriesApi.getAllForAdmin().then((r) => r.data.data),
    staleTime: 0,
  });
}
