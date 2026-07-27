/**
 * TanStack Query hooks for categories.
 */
import { useQuery } from '@tanstack/react-query';
import { categoriesApi } from '@/api/categories.api';
import { queryKeys }     from '@/lib/queryKeys';
import { CACHE_TTL }     from '@/lib/constants';

/** All categories (tree structure). Cached for 1 hour. */
export function useCategories() {
  return useQuery({
    queryKey:  queryKeys.categories.all(),
    // PERF-10 FIX: was r.data — returns the ApiResponse envelope.
    // Must be r.data.data to get the actual Category[] payload.
    // CategoryGrid was reading data?.data which masked this bug — it
    // produced data?.data?.data === undefined, silently rendering empty.
    queryFn:   () => categoriesApi.getAll().then((r) => r.data.data),
    staleTime: CACHE_TTL.categories,
  });
}

/** Single category by slug. */
export function useCategoryBySlug(slug: string) {
  return useQuery({
    queryKey:  queryKeys.categories.slug(slug),
    // PERF-10 FIX: same issue — unwrap one level deeper.
    queryFn:   () => categoriesApi.getBySlug(slug).then((r) => r.data.data),
    staleTime: CACHE_TTL.categories,
    enabled:   Boolean(slug),
  });
}
