'use client';

import { useQuery } from '@tanstack/react-query';
import { CACHE_TTL } from '@/lib/constants';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { productCategoriesApi } from '@/api/product-categories.api';
import { queryKeys } from '@/lib/queryKeys';
import { CategoryFilterChips } from '@/components/shared/filters/CategoryFilterChips';

/** Root-level product category shortcuts; selection state lives in the URL. */
export function ProductCategoryChips() {
  const filters = useUnifiedFilters({ profile: 'productsBrowse', mode: 'replace' });
  const activeId = filters.get('categoryId') ?? '';

  const { data } = useQuery({
    queryKey: queryKeys.productCategories.all(),
    queryFn: async ({ signal }) => {
      const response = await productCategoriesApi.getAll({ signal });
      return response.data.data ?? [];
    },
    staleTime: CACHE_TTL.categories,
  });

  const categories = (data ?? []).filter((category) => category.isActive !== false && !category.parentId);

  function select(categoryId: string) {
    filters.update('categoryId', categoryId || null, { mode: 'replace' });
  }

  return (
    <CategoryFilterChips
      categories={categories}
      activeId={activeId}
      onSelect={select}
      ariaLabel="تصنيفات المنتجات"
    />
  );
}
