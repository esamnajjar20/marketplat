'use client';

import { FilterSheet } from '@/components/shared/filters/FilterSheet';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { ServiceCategoryFilter } from './ServiceCategoryFilter';

/** Mobile service filters share the same controller, count, and sheet UI. */
export function ServiceFiltersSheet() {
  const filters = useUnifiedFilters({ basePath: '/services', profile: 'servicesBrowse' });

  return (
    <FilterSheet activeCount={filters.activeCount}>
      <ServiceCategoryFilter showPanelTitle={false} />
    </FilterSheet>
  );
}
