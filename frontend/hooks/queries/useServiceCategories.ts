'use client';

import { useQuery } from '@tanstack/react-query';
import { serviceCategoriesApi } from '@/api/service-categories.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

/** All service categories. Long cache — admin-managed taxonomy, changes rarely. */
export function useServiceCategories() {
  return useQuery({
    queryKey: queryKeys.serviceCategories.all(),
    queryFn: () => serviceCategoriesApi.getAll().then((r) => r.data.data),
    staleTime: CACHE_TTL.categories,
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
