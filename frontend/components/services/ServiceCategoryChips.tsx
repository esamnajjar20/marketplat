'use client';

import { useQuery } from '@tanstack/react-query';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { serviceCategoriesApi } from '@/api/service-categories.api';
import { queryKeys } from '@/lib/queryKeys';
import { CategoryFilterChips } from '@/components/shared/filters/CategoryFilterChips';

/** Root-level service category shortcuts; selection state lives in the URL. */
export function ServiceCategoryChips() {
  const filters = useUnifiedFilters({ profile: 'servicesBrowse', mode: 'replace' });
  const activeId = filters.get('categoryId') ?? '';

  const { data } = useQuery({
    queryKey: queryKeys.serviceCategories.all(),
    queryFn: async ({ signal }) => {
      const response = await serviceCategoriesApi.getAll({ signal });
      return response.data.data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const categories = (data ?? []).filter((category) => {
    if (category.parentId) return false;
    return (category as { isActive?: boolean }).isActive !== false;
  });

  function select(categoryId: string) {
    filters.update('categoryId', categoryId || null, { mode: 'replace' });
  }

  return (
    <CategoryFilterChips
      categories={categories}
      activeId={activeId}
      onSelect={select}
      ariaLabel="تصنيفات الخدمات"
    />
  );
}
