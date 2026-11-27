'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shared/ui/Select';
import { FilterPanel } from '@/components/shared/filters/FilterPanel';
import { FilterField } from '@/components/shared/filters/FilterField';
import { FilterCitySelect } from '@/components/shared/filters/FilterCitySelect';
import { FilterPriceRangeFields } from '@/components/shared/filters/FilterPriceRangeFields';
import { CONDITION_LABELS, ROUTES } from '@/lib/constants';
import { useCategories } from '@/hooks/queries/useCategories';
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { cn } from '@/lib/utils';
import type { SearchType } from '@/types/search.types';
import type { AdCondition } from '@marketplat/contracts';
import { PRICE_PRESETS } from '@/types/filter.types';
import { parseSearchParams } from '@/lib/filterUrl';
import { FilterResetButton } from '@/components/shared/filters/FilterResetButton';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import type { FilterPatch } from '../../../shared/filters';

export function SearchFilters({ showPanelTitle = true }: { showPanelTitle?: boolean } = {}) {
  const filters = useUnifiedFilters({ basePath: ROUTES.search, profile: 'globalSearch', mode: 'replace' });
  const params = filters.params;
  const state = parseSearchParams(params);
  const [minPriceDraft, setMinPriceDraft] = useState(params.get('minPrice') ?? '');
  const [maxPriceDraft, setMaxPriceDraft] = useState(params.get('maxPrice') ?? '');

  useEffect(() => {
    setMinPriceDraft(params.get('minPrice') ?? '');
    setMaxPriceDraft(params.get('maxPrice') ?? '');
  }, [params]);

  const type = (state.type ?? 'all') as SearchType;
  const hasCategory = Boolean(state.categoryId);
  const [advancedOpen, setAdvancedOpen] = useState(hasCategory);

  const showCategoryFilter = ['ads', 'products', 'services', 'all'].includes(type);
  // Fetch only the taxonomy needed for the active tab, and only when expanded.
  const shouldLoadAdCategories = advancedOpen && (type === 'ads' || type === 'all');
  const shouldLoadProductCategories = advancedOpen && (type === 'products' || type === 'all');
  const shouldLoadServiceCategories = advancedOpen && (type === 'services' || type === 'all');
  const { data: adCategories } = useCategories({ enabled: shouldLoadAdCategories });
  const { data: productCategories } = useProductCategories({ enabled: shouldLoadProductCategories });
  const { data: serviceCategories } = useServiceCategories({ enabled: shouldLoadServiceCategories });

  function apply(patch: Record<string, unknown> & { clearKeys?: string[] }) {
    const { clearKeys = [], ...updates } = patch;
    filters.updateMany(updates as FilterPatch, { clearKeys, mode: 'replace' });
  }

  function updatePrice(key: 'minPrice' | 'maxPrice', value: string) {
    if (key === 'minPrice') setMinPriceDraft(value);
    else setMaxPriceDraft(value);
    filters.updateDebounced(key, value, 400, { mode: 'replace' });
  }

  return (
    <FilterPanel showTitle={showPanelTitle}>
      <FilterCitySelect
        id="search-filter-city"
        value={state.city ?? ''}
        onChange={(value) => apply(
          value ? { city: value } : { city: undefined, clearKeys: ['city'] },
        )}
      />

      <FilterField label="السعر">
        <div className="flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((preset) => {
            const isActive =
              (preset.min == null && preset.max == null && state.minPrice == null && state.maxPrice == null) ||
              (preset.min === state.minPrice && preset.max === state.maxPrice);

            return (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant={isActive ? 'secondary' : 'outline'}
                className="rounded-full text-xs"
                onClick={() => {
                  filters.cancelPending();
                  setMinPriceDraft(preset.min == null ? '' : String(preset.min));
                  setMaxPriceDraft(preset.max == null ? '' : String(preset.max));
                  apply({
                    minPrice: preset.min,
                    maxPrice: preset.max,
                    clearKeys: preset.min == null && preset.max == null
                      ? ['minPrice', 'maxPrice']
                      : undefined,
                  });
                }}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>
      </FilterField>

      <FilterPriceRangeFields
        minId="search-filter-min-price"
        maxId="search-filter-max-price"
        minValue={minPriceDraft}
        maxValue={maxPriceDraft}
        onMinChange={(value) => updatePrice('minPrice', value)}
        onMaxChange={(value) => updatePrice('maxPrice', value)}
        title="نطاق السعر"
        minLabel="من"
        maxLabel="إلى"
        minPlaceholder="0"
        maxPlaceholder="بدون حد"
      />

      {showCategoryFilter ? (
        <div className="border-t pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-sm font-medium"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
          >
            <span className="flex items-center gap-2">
              خيارات أكثر
              {hasCategory ? (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-2xs-tight font-semibold text-primary">
                  مفعّل
                </span>
              ) : null}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                advancedOpen && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </button>

          {advancedOpen ? (
            <div className="mt-3 space-y-3">
              <FilterField label="الفئة">
                <Select
                  value={state.categoryId || 'ALL'}
                  onValueChange={(value) => apply(
                    value === 'ALL'
                      ? { categoryId: undefined, clearKeys: ['categoryId'] }
                      : { categoryId: value },
                  )}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="كل الفئات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">كل الفئات</SelectItem>
                    {(type === 'ads' || type === 'all') && adCategories?.map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.nameAr}</SelectItem>
                    ))}
                    {(type === 'products' || type === 'all') && productCategories?.map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.nameAr}</SelectItem>
                    ))}
                    {(type === 'services' || type === 'all') && serviceCategories?.map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.nameAr}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>

              {(type === 'ads' || type === 'all') ? (
                <FilterField label="حالة الإعلان">
                  <Select
                    value={state.condition || 'ALL'}
                    onValueChange={(value) => apply(
                      value === 'ALL'
                        ? { condition: undefined, clearKeys: ['condition'] }
                        : { condition: value as AdCondition },
                    )}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="كل الحالات" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">كل الحالات</SelectItem>
                      {Object.entries(CONDITION_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <FilterResetButton
        onClick={() => {
          filters.cancelPending();
          setMinPriceDraft('');
          setMaxPriceDraft('');
          filters.clear(['q', 'type'], 'replace');
        }}
      />
    </FilterPanel>
  );
}
