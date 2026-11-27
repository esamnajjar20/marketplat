'use client';

import { FilterSheet } from '@/components/shared/filters/FilterSheet';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { ProductsFilters } from './ProductsFilters';

/** Mobile filter entry for /products. */
export function ProductsFiltersSheet() {
  const filters = useUnifiedFilters({ profile: 'productsBrowse' });

  return (
    <FilterSheet activeCount={filters.activeCount}>
      <ProductsFilters showPanelTitle={false} />
    </FilterSheet>
  );
}
