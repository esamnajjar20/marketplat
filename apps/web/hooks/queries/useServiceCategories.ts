'use client';

import { useQuery } from '@tanstack/react-query';
import { useOfflineListSeed } from '@/lib/useOfflineListSeed';
import { serviceCategoriesApi } from '@/api/service-categories.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  getOfflineList,
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';

/** All service categories. Long cache — admin-managed taxonomy, changes rarely.
 *
 * same offline snapshot handling as
 * useProductCategories (and as useCategories already had). */
export function useServiceCategories(options?: { enabled?: boolean }) {
  const queryKey = queryKeys.serviceCategories.all();
  useOfflineListSeed<unknown, unknown[]>({
    queryKey,
    cacheKey: OFFLINE_LIST_KEYS.serviceCategories,
    enabled: options?.enabled ?? true,
    mapItems: (items) => items as never,
  });

  return useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const data = await serviceCategoriesApi.getAll().then((r) => r.data.data);
        if (Array.isArray(data)) {
          saveOfflineList(
            OFFLINE_LIST_KEYS.serviceCategories,
            data as unknown[],
            OFFLINE_LIST_LIMITS.serviceCategories,
          );
        }
        return data;
      } catch (err) {
        const local = getOfflineList<unknown>(OFFLINE_LIST_KEYS.serviceCategories);
        if (local) return local.items as never;
        throw err;
      }
    },
    staleTime: CACHE_TTL.categories,
    enabled: options?.enabled ?? true,
  });
}

export function useServiceCategoryBySlug(slug: string) {
  return useQuery({
    queryKey: queryKeys.serviceCategories.slug(slug),
    queryFn: () => serviceCategoriesApi.getBySlug(slug).then((r) => r.data.data),
    staleTime: CACHE_TTL.categories,
    enabled: Boolean(slug),
  });
}

/**
 * EPIC 1.2: GET /service-categories/admin/all — the report's finding
 * was that service-categories had full admin CRUD on the backend with
 * zero frontend UI. staleTime: 0 (not CACHE_TTL.categories like the
 * public hook above) because this always needs the live, uncached
 * state an admin is actively editing — the backend endpoint itself is
 * also deliberately uncached for the same reason.
 */
export function useServiceCategoriesForAdmin() {
  return useQuery({
    queryKey: queryKeys.serviceCategories.adminAll(),
    queryFn: () => serviceCategoriesApi.getAllForAdmin().then((r) => r.data.data),
    staleTime: 0,
  });
}
