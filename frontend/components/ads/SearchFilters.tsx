'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/shared/ui/Select';
import { FilterPanel } from '@/components/shared/filters/FilterPanel';
import { FilterField } from '@/components/shared/filters/FilterField';
import { FilterCitySelect } from '@/components/shared/filters/FilterCitySelect';
import { FilterSelect } from '@/components/shared/filters/FilterSelect';
import { FilterPriceRangeFields } from '@/components/shared/filters/FilterPriceRangeFields';
import { FilterResetButton } from '@/components/shared/filters/FilterResetButton';
import { CONDITION_LABELS, ROUTES } from '@/lib/constants';
import { useCategories, useCategoryBySlug } from '@/hooks/queries/useCategories';
import { signalNavigationStart } from '@/components/shared/NavigationProgress';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';

interface Props {
  categorySlug?: string;
  showPanelTitle?: boolean;
}

export function SearchFilters({ categorySlug, showPanelTitle = true }: Props = {}) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const filters = useUnifiedFilters({ basePath: pathname, profile: categorySlug ? 'adsCategoryBrowse' : 'adsBrowse', mode: 'push' });
  const { data: categories } = useCategories();
  const { data: activeCategory } = useCategoryBySlug(categorySlug ?? '');
  const activeCategoryId = sp.get('categoryId') ?? activeCategory?.id ?? '';
  const includeRootCategories = Boolean(categorySlug) || pathname !== ROUTES.ads;
  const hasSelectableActiveCategory = includeRootCategories || !activeCategoryId ||
    Boolean(categories?.some((category) => category.children?.some((child) => child.id === activeCategoryId)));

  const [minPrice, setMinPrice] = useState(sp.get('minPrice') ?? '');
  const [maxPrice, setMaxPrice] = useState(sp.get('maxPrice') ?? '');

  useEffect(() => {
    setMinPrice(sp.get('minPrice') ?? '');
    setMaxPrice(sp.get('maxPrice') ?? '');
  }, [sp]);

  function update(key: string, value: string) {
    filters.update(key, value);
  }

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

  function updateCategory(categoryId: string) {
    if (!categoryId) {
      if (categorySlug && pathname !== ROUTES.search) signalNavigationStart(ROUTES.search);
      if (categorySlug) router.push(ROUTES.search);
      else update('categoryId', '');
      return;
    }

    const flat = (categories ?? []).flatMap((category) => [category, ...(category.children ?? [])]);
    const match = flat.find((category) => category.id === categoryId);
    if (match) {
      const destination = ROUTES.category(match.slug);
      if (destination !== pathname) signalNavigationStart(destination);
      router.push(destination);
    } else {
      update('categoryId', categoryId);
    }
  }

  return (
    <FilterPanel showTitle={showPanelTitle}>
      <FilterField label="الفئة">
        <Select
          value={hasSelectableActiveCategory ? activeCategoryId || 'ALL' : 'ALL'}
          onValueChange={(value) => updateCategory(value === 'ALL' ? '' : value)}
        >
          <SelectTrigger className="w-full"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل الفئات</SelectItem>
            {categories?.map((category) => (
              <SelectGroup key={category.id}>
                <SelectLabel>{category.nameAr}</SelectLabel>
                {includeRootCategories ? <SelectItem value={category.id}>{category.nameAr}</SelectItem> : null}
                {category.children?.map((child) => (
                  <SelectItem key={child.id} value={child.id}>— {child.nameAr}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </FilterField>

      <FilterCitySelect id="ads-filter-city" value={sp.get('city') ?? ''} onChange={(value) => update('city', value)} />

      <FilterSelect
        id="ads-filter-condition"
        label="الحالة"
        value={sp.get('condition') ?? ''}
        allLabel="كل الحالات"
        options={Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label }))}
        onChange={(value) => update('condition', value)}
      />

      <FilterPriceRangeFields
        minId="ads-filter-min-price"
        maxId="ads-filter-max-price"
        minValue={minPrice}
        maxValue={maxPrice}
        onMinChange={(value) => updatePrice('minPrice', value)}
        onMaxChange={(value) => updatePrice('maxPrice', value)}
        title="السعر (₪)"
        minLabel="من"
        maxLabel="إلى"
      />

      <FilterResetButton onClick={resetFilters} />
    </FilterPanel>
  );
}
