'use client';

import { useEffect, useState } from 'react';
import { ROUTES } from '@/lib/constants';
import { useServiceTypes } from '@/hooks/queries/useServiceTypes';
import type { ServiceTypeField } from '@/types/service.types';
import { Input } from '@/components/shared/ui/Input';
import { FilterPanel } from '@/components/shared/filters/FilterPanel';
import { FilterField } from '@/components/shared/filters/FilterField';
import { FilterCitySelect } from '@/components/shared/filters/FilterCitySelect';
import { FilterSelect } from '@/components/shared/filters/FilterSelect';
import { FilterSearchInput } from '@/components/shared/filters/FilterSearchInput';
import { FilterPriceRangeFields } from '@/components/shared/filters/FilterPriceRangeFields';
import { FilterResetButton } from '@/components/shared/filters/FilterResetButton';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';

const LOCATION_LABELS: Record<string, string> = {
  AT_CUSTOMER: 'لدى العميل',
  AT_PROVIDER: 'لدى مقدم الخدمة',
  REMOTE: 'عن بُعد',
};

export function ServiceCategoryFilter({ showPanelTitle = true }: { showPanelTitle?: boolean } = {}) {
  const filters = useUnifiedFilters({
    basePath: ROUTES.services,
    mode: 'push',
    profile: 'servicesBrowse',
  });
  const sp = filters.params;
  const [serviceTypesRequested, setServiceTypesRequested] = useState(false);
  const serviceTypeId = sp.get('serviceTypeId');
  const { data: serviceTypes } = useServiceTypes({
    enabled: Boolean(serviceTypeId) || serviceTypesRequested,
  });
  const selectedType = serviceTypes?.find((type) => type.id === serviceTypeId);
  const availableLocations = Object.entries(LOCATION_LABELS).filter(([value]) => {
    const capabilities = selectedType?.capabilities;
    if (!capabilities) return true;
    if (value === 'REMOTE') return capabilities.remote !== false;
    if (value === 'AT_CUSTOMER') return capabilities.atCustomer !== false;
    if (value === 'AT_PROVIDER') return capabilities.atProvider !== false;
    return true;
  });

  const [minPrice, setMinPrice] = useState(sp.get('minPrice') ?? '');
  const [maxPrice, setMaxPrice] = useState(sp.get('maxPrice') ?? '');

  useEffect(() => {
    setMinPrice(sp.get('minPrice') ?? '');
    setMaxPrice(sp.get('maxPrice') ?? '');
    // Keep the draft values synchronized with browser back/forward navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.get('minPrice'), sp.get('maxPrice')]);

  function update(key: string, value: string) {
    const clearKeys = key === 'serviceTypeId'
      ? ['categoryId', 'attributeFilters', 'serviceLocation']
      : [];
    filters.update(key, value, { clearKeys });
  }

  function readAttributeFilters(): Record<string, unknown> {
    const raw = sp.get('attributeFilters');
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  function updateAttributeFilter(field: ServiceTypeField, value: unknown) {
    const attributeValues = readAttributeFilters();
    if (value === '' || value === null || value === undefined || (Array.isArray(value) && value.length === 0)) {
      delete attributeValues[field.key];
    } else {
      attributeValues[field.key] = value;
    }

    const serialized = Object.keys(attributeValues).length ? JSON.stringify(attributeValues) : null;
    filters.update('attributeFilters', serialized);
  }

  const dynamicFields = (selectedType?.fields ?? []).filter(
    (field) => field.isActive && field.scope === 'LISTING' && ['SELECT', 'BOOLEAN', 'NUMBER', 'TEXT'].includes(field.type),
  );
  const activeAttributeFilters = readAttributeFilters();
  const [draftAttributes, setDraftAttributes] = useState<Record<string, string | number>>({});
  const activeFilterCount = filters.activeCount;

  useEffect(() => {
    setDraftAttributes({});
  }, [sp.get('serviceTypeId'), sp.get('attributeFilters')]);

  function clearAll() {
    filters.cancelPending();
    setMinPrice('');
    setMaxPrice('');
    setDraftAttributes({});
    filters.clear([]);
  }

  function applyDraftAttribute(field: ServiceTypeField) {
    const value = draftAttributes[field.key];
    updateAttributeFilter(field, value === '' || value === undefined ? '' : value);
  }

  return (
    <FilterPanel showTitle={showPanelTitle}>
      <FilterSearchInput
        id="svc-filter-search"
        value={sp.get('search') ?? ''}
        placeholder="ابحث عن خدمة…"
        onApply={(value) => update('search', value)}
      />

      <FilterSelect
        id="svc-filter-type"
        label="مجال الخدمة"
        value={serviceTypeId ?? ''}
        allLabel="كل المجالات"
        onOpenChange={(open) => { if (open) setServiceTypesRequested(true); }}
        options={(serviceTypes ?? []).map((type) => ({ value: type.id, label: type.nameAr }))}
        onChange={(value) => update('serviceTypeId', value)}
      />

      <FilterCitySelect
        id="svc-filter-city"
        value={sp.get('city') ?? ''}
        onChange={(value) => update('city', value)}
      />

      <FilterSelect
        id="svc-filter-location"
        label="موقع تقديم الخدمة"
        value={sp.get('serviceLocation') ?? ''}
        allLabel="كل المواقع"
        options={availableLocations.map(([value, label]) => ({ value, label }))}
        onChange={(value) => update('serviceLocation', value)}
      />

      <FilterPriceRangeFields
        minId="svc-filter-min"
        maxId="svc-filter-max"
        minValue={minPrice}
        maxValue={maxPrice}
        onMinChange={(value) => { setMinPrice(value); filters.updateDebounced('minPrice', value, 400); }}
        onMaxChange={(value) => { setMaxPrice(value); filters.updateDebounced('maxPrice', value, 400); }}
        title="نطاق السعر"
        minLabel="أقل سعر"
        maxLabel="أعلى سعر"
      />

      {dynamicFields.length > 0 ? (
        <div className="space-y-3 border-t pt-4">
          <div className="text-xs font-semibold text-muted-foreground">
            خصائص {selectedType?.nameAr}
          </div>
          {dynamicFields.map((field) => {
            const current = activeAttributeFilters[field.key];

            if (field.type === 'SELECT') {
              return (
                <FilterSelect
                  key={field.key}
                  id={`svc-filter-${field.key}`}
                  label={field.labelAr}
                  value={typeof current === 'string' ? current : ''}
                  allLabel={`كل ${field.labelAr}`}
                  options={(field.options ?? []).map((option) => ({ value: option.value, label: option.labelAr }))}
                  onChange={(value) => updateAttributeFilter(field, value)}
                />
              );
            }

            if (field.type === 'BOOLEAN') {
              const value = current === true ? 'true' : current === false ? 'false' : 'ALL';
              return (
                <FilterSelect
                  key={field.key}
                  id={`svc-filter-${field.key}`}
                  label={field.labelAr}
                  value={value === 'ALL' ? '' : value}
                  allLabel="الكل"
                  options={[{ value: 'true', label: 'نعم' }, { value: 'false', label: 'لا' }]}
                  onChange={(next) => updateAttributeFilter(field, next === '' ? '' : next === 'true')}
                />
              );
            }

            return (
              <FilterField key={field.key} id={`svc-filter-${field.key}`} label={field.labelAr}>
                <Input
                  id={`svc-filter-${field.key}`}
                  type={field.type === 'NUMBER' ? 'number' : 'text'}
                  value={draftAttributes[field.key] ?? (typeof current === 'string' || typeof current === 'number' ? String(current) : '')}
                  onChange={(event) => setDraftAttributes((draft) => ({
                    ...draft,
                    [field.key]: field.type === 'NUMBER'
                      ? (event.target.value === '' ? '' : Number(event.target.value))
                      : event.target.value,
                  }))}
                  onBlur={() => applyDraftAttribute(field)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      applyDraftAttribute(field);
                    }
                  }}
                />
              </FilterField>
            );
          })}
        </div>
      ) : null}
      <FilterResetButton onClick={clearAll} disabled={activeFilterCount === 0} label={activeFilterCount > 0 ? `مسح الكل (${activeFilterCount})` : 'إعادة تعيين الفلاتر'} />
    </FilterPanel>
  );
}
