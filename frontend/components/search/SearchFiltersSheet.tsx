'use client';

import { FilterSheet } from '@/components/shared/filters/FilterSheet';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { SearchFilters } from './SearchFilters';

/** Mobile filter entry for cross-market search. */
export function SearchFiltersSheet() {
  const filters = useUnifiedFilters({
    basePath: '/search',
    mode: 'replace',
    profile: 'globalSearch',
  });

  return (
    <FilterSheet activeCount={filters.activeCount}>
      <SearchFilters showPanelTitle={false} />
    </FilterSheet>
  );
}
