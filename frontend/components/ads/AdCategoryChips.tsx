'use client';

import { useQuery } from '@tanstack/react-query';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { categoriesApi } from '@/api/categories.api';
import { queryKeys } from '@/lib/queryKeys';
import { CategoryFilterChips } from '@/components/shared/filters/CategoryFilterChips';

/** Root-level ad category shortcuts; selection state lives in the URL. */
export function AdCategoryChips() {
  const filters = useUnifiedFilters({ profile: 'adsBrowse', mode: 'replace' });
  const activeId = filters.get('categoryId') ?? '';

  const { data } = useQuery({
    queryKey: queryKeys.categories.all(),
    queryFn: async ({ signal }) => {
      const response = await categoriesApi.getAll({ signal });
      return response.data.data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const categories = (data ?? []).filter(
    (category) => !category.parentId && (category as { isActive?: boolean }).isActive !== false,
  );

  function select(categoryId: string) {
    filters.update('categoryId', categoryId || null, { mode: 'replace' });
  }

  return (
    <CategoryFilterChips
      categories={categories}
      activeId={activeId}
      onSelect={select}
      ariaLabel="تصنيفات الإعلانات"
    />
  );
}
