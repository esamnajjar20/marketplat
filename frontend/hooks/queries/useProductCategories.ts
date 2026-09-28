'use client';

import { useQuery } from '@tanstack/react-query';
import { productCategoriesApi } from '@/api/product-categories.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  getOfflineList,
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';

/** All product categories. Long cache — admin-managed taxonomy, changes rarely.
 *
 * FIX CATEGORIES-OFFLINE-01: mirrors useCategories' offline snapshot
 * handling. Previously this hook was live-only, so offline the
 * product-create form rendered an empty category <select>, and the
 * required-field validation blocked submit with no way to satisfy it
 * (the exact "لازم فئة واصلا مش مبين فئات" report). */
export function useProductCategories(options?: { enabled?: boolean }) {
  const cached = getOfflineList<unknown>(OFFLINE_LIST_KEYS.productCategories);

  return useQuery({
    queryKey: queryKeys.productCategories.all(),
    queryFn: async () => {
      try {
        const data = await productCategoriesApi.getAll().then((r) => r.data.data);
        if (Array.isArray(data) && data.length) {
          saveOfflineList(
            OFFLINE_LIST_KEYS.productCategories,
            data as unknown[],
            OFFLINE_LIST_LIMITS.productCategories,
          );
        }
        return data;
      } catch (err) {
        const local = getOfflineList<unknown>(OFFLINE_LIST_KEYS.productCategories);
        if (local?.items?.length) return local.items as never;
        throw err;
      }
    },
    staleTime: CACHE_TTL.categories,
    enabled: options?.enabled ?? true,
    ...(cached?.items?.length
      ? {
          initialData: cached.items as never,
          initialDataUpdatedAt: new Date(cached.savedAt).getTime(),
        }
      : {}),
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
