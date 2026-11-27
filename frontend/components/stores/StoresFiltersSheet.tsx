'use client';

import { FilterSheet } from '@/components/shared/filters/FilterSheet';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { StoresFilters } from './StoresFilters';

/** Mobile store filters use the same shared sheet as every browse page. */
export function StoresFiltersSheet() {
  const filters = useUnifiedFilters({ basePath: '/stores', profile: 'storesBrowse' });

  return (
    <FilterSheet activeCount={filters.activeCount}>
      <StoresFilters showPanelTitle={false} />
    </FilterSheet>
  );
}
