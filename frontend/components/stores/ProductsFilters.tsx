'use client';

import { useEffect, useState } from 'react';
import { FilterPanel } from '@/components/shared/filters/FilterPanel';
import { FilterCitySelect } from '@/components/shared/filters/FilterCitySelect';
import { FilterSearchInput } from '@/components/shared/filters/FilterSearchInput';
import { FilterPriceRangeFields } from '@/components/shared/filters/FilterPriceRangeFields';
import { FilterSelect } from '@/components/shared/filters/FilterSelect';
import { FilterCheckbox } from '@/components/shared/filters/FilterCheckbox';
import { FilterResetButton } from '@/components/shared/filters/FilterResetButton';
import { ROUTES } from '@/lib/constants';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { useSearchParams } from 'next/navigation';
import type { ProductAvailability } from '@/types/product.types';

const AVAILABILITY_OPTIONS = [
  { value: 'IN_STOCK', label: 'متوفر' },
  { value: 'LIMITED', label: 'كمية محدودة' },
  { value: 'OUT_OF_STOCK', label: 'غير متوفر' },
] as const;

/** URL-driven filters for the public products listing. */
export function ProductsFilters({ showPanelTitle = true }: { showPanelTitle?: boolean } = {}) {
  const sp = useSearchParams();
  const filters = useUnifiedFilters({ basePath: ROUTES.products, profile: 'productsBrowse', mode: 'push' });
  const [minPrice, setMinPrice] = useState(sp.get('minPrice') ?? '');
  const [maxPrice, setMaxPrice] = useState(sp.get('maxPrice') ?? '');

  useEffect(() => {
    setMinPrice(sp.get('minPrice') ?? '');
    setMaxPrice(sp.get('maxPrice') ?? '');
  }, [sp]);

  function updatePrice(key: 'minPrice' | 'maxPrice', value: string) {
    if (key === 'minPrice') setMinPrice(value);
    else setMaxPrice(value);
    filters.updateDebounced(key, value, 400);
  }

  function resetFilters() {
    filters.cancelPending();
    setMinPrice('');
    setMaxPrice('');
    filters.clear([]);
  }

  return (
    <FilterPanel showTitle={showPanelTitle}>
      <FilterSearchInput
        id="products-filter-search"
        value={sp.get('search') ?? ''}
        placeholder="ابحث عن منتج…"
        label="بحث"
        onApply={(value) => filters.update('search', value)}
      />
      <FilterCitySelect
        id="products-filter-city"
        value={sp.get('city') ?? ''}
        onChange={(value) => filters.update('city', value)}
      />
      <FilterSelect
        id="products-filter-availability"
        label="التوفر"
        value={sp.get('availability') ?? ''}
        allLabel="كل الحالات"
        options={AVAILABILITY_OPTIONS}
        onChange={(value) => filters.update('availability', value as ProductAvailability | '')}
      />
      <FilterPriceRangeFields
        minId="products-filter-min-price"
        maxId="products-filter-max-price"
        minValue={minPrice}
        maxValue={maxPrice}
        onMinChange={(value) => updatePrice('minPrice', value)}
        onMaxChange={(value) => updatePrice('maxPrice', value)}
        title="نطاق السعر (₪)"
      />
      <FilterCheckbox
        checked={sp.get('hasPromotion') === 'true'}
        onChange={(checked) => filters.update('hasPromotion', checked ? 'true' : null)}
      >
        عروض فقط 🔥
      </FilterCheckbox>
      <FilterResetButton onClick={resetFilters} />
    </FilterPanel>
  );
}
