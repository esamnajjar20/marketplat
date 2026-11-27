'use client';

import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { FilterSheet } from '@/components/shared/filters/FilterSheet';
import { SearchFilters } from './SearchFilters';

interface Props { categorySlug?: string; }

/** Mobile filter entry for ads lists and category pages. */
export function SearchFiltersSheet({ categorySlug }: Props = {}) {
  const filters = useUnifiedFilters({
    profile: categorySlug ? 'adsCategoryBrowse' : 'adsBrowse',
  });

  return (
    <FilterSheet activeCount={filters.activeCount}>
      <SearchFilters categorySlug={categorySlug} showPanelTitle={false} />
    </FilterSheet>
  );
}
