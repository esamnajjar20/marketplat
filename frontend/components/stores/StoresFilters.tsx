'use client';

import { FilterPanel } from '@/components/shared/filters/FilterPanel';
import { useState } from 'react';
import { FilterCitySelect } from '@/components/shared/filters/FilterCitySelect';
import { FilterSearchInput } from '@/components/shared/filters/FilterSearchInput';
import { FilterSelect } from '@/components/shared/filters/FilterSelect';
import { FilterResetButton } from '@/components/shared/filters/FilterResetButton';
import { ROUTES } from '@/lib/constants';
import { useStoreTypes } from '@/hooks/queries/useStoreTypes';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';

/** Public store-directory filters built entirely from shared filter primitives. */
export function StoresFilters({ showPanelTitle = true }: { showPanelTitle?: boolean } = {}) {
  const filters = useUnifiedFilters({ basePath: ROUTES.stores, profile: 'storesBrowse', mode: 'push' });
  const [storeTypesRequested, setStoreTypesRequested] = useState(false);
  const { data: storeTypes = [] } = useStoreTypes({
    enabled: Boolean(filters.get('type')) || storeTypesRequested,
  });

  return (
    <FilterPanel showTitle={showPanelTitle}>
      <FilterSearchInput
        id="stores-filter-search"
        value={filters.get('search') ?? ''}
        placeholder="ابحث عن متجر…"
        label="بحث"
        onApply={(value) => filters.update('search', value)}
      />
      <FilterSelect
        id="stores-filter-type"
        label="نوع المتجر"
        value={filters.get('type') ?? ''}
        allLabel="كل الأنواع"
        onOpenChange={(open) => { if (open) setStoreTypesRequested(true); }}
        options={storeTypes.map((type) => ({ value: type.slug, label: type.nameAr }))}
        onChange={(value) => filters.update('type', value)}
      />
      <FilterCitySelect
        id="stores-filter-city"
        value={filters.get('city') ?? ''}
        onChange={(value) => filters.update('city', value)}
      />
      <FilterResetButton onClick={() => filters.clear([])} />
    </FilterPanel>
  );
}
