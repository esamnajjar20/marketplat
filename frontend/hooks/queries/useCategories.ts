/**
 * TanStack Query hooks for categories.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { categoriesApi } from '@/api/categories.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import type { Category } from '@/types/category.types';
import {
  getOfflineList,
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';

/** All categories (tree structure). Cached for 1 hour + offline snapshot. */
export function useCategories() {
  const cached = getOfflineList<Category>(OFFLINE_LIST_KEYS.categories);

  return useQuery({
    queryKey: queryKeys.categories.all(),
    queryFn: async (): Promise<Category[]> => {
      try {
        const data = await categoriesApi.getAll().then((r) => r.data.data);
        if (Array.isArray(data) && data.length) {
          saveOfflineList(
            OFFLINE_LIST_KEYS.categories,
            data as Category[],
            OFFLINE_LIST_LIMITS.categories,
          );
        }
        return data as Category[];
      } catch (err) {
        const local = getOfflineList<Category>(OFFLINE_LIST_KEYS.categories);
        if (local?.items?.length) return local.items;
        throw err;
      }
    },
    staleTime: CACHE_TTL.categories,
    ...(cached?.items?.length
      ? {
          initialData: cached.items,
          initialDataUpdatedAt: new Date(cached.savedAt).getTime(),
        }
      : {}),
  });
}

/** Single category by slug. */
export function useCategoryBySlug(slug: string) {
  return useQuery({
    queryKey: queryKeys.categories.slug(slug),
    queryFn: () => categoriesApi.getBySlug(slug).then((r) => r.data.data),
    staleTime: CACHE_TTL.categories,
    enabled: Boolean(slug),
  });
}
