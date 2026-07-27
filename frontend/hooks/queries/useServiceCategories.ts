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
