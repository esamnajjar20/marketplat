'use client';

import { useState } from 'react';
import { ROUTES } from '@/lib/constants';
import type { RequestType } from '@/types/request.types';
import { useServiceTypes } from '@/hooks/queries/useServiceTypes';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { buildFilterHref, buildFilterParams } from '../../../shared/filters';
import { FilterSearchInput } from '@/components/shared/filters/FilterSearchInput';
import { FilterCitySelect } from '@/components/shared/filters/FilterCitySelect';
import { FilterSelect } from '@/components/shared/filters/FilterSelect';
import { FilterResetButton } from '@/components/shared/filters/FilterResetButton';
import { cn } from '@/lib/utils';

/** ترتيب قائمة الطلبات (واجهة — يُطبَّق على الصفحة الحالية) */
export type RequestSort = 'newest' | 'expiring' | 'budget_high' | 'fewest_offers';

export const REQUEST_SORT_OPTIONS = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'expiring', label: 'الأقرب للانتهاء' },
  { value: 'budget_high', label: 'الأعلى ميزانية' },
  { value: 'fewest_offers', label: 'أقل عروضًا' },
] as const;

/** Compatibility serializer backed by the monorepo filter core. */
export function buildRequestsHref(opts: {
  type?: RequestType;
  city?: string;
  serviceTypeId?: string;
  q?: string;
  sort?: RequestSort;
  page?: number;
  base?: string;
}): string {
  const params = buildFilterParams({
    type: opts.type,
    city: opts.city,
    serviceTypeId: opts.type === 'SERVICE' ? opts.serviceTypeId : undefined,
    q: opts.q,
    sort: opts.sort && opts.sort !== 'newest' ? opts.sort : undefined,
    page: opts.page && opts.page > 1 ? opts.page : undefined,
  }, { profile: 'openRequests' });
  return buildFilterHref(opts.base ?? ROUTES.requests, params);
}

export function parseRequestSort(raw: string | null | undefined): RequestSort {
  if (raw === 'expiring' || raw === 'budget_high' || raw === 'fewest_offers' || raw === 'newest') return raw;
  return 'newest';
}

type Props = {
  type?: RequestType;
  city?: string;
  serviceTypeId?: string;
  q?: string;
  sort?: RequestSort;
  className?: string;
  totalLabel?: string;
};

export function RequestFilters({
  type,
  city,
  serviceTypeId,
  q,
  sort = 'newest',
  className,
  totalLabel,
}: Props) {
  const filters = useUnifiedFilters({
    basePath: ROUTES.requests,
    mode: 'replace',
    profile: 'openRequests',
  });
  const [serviceTypesRequested, setServiceTypesRequested] = useState(false);
  const shouldLoadServiceTypes = type === 'SERVICE' && (Boolean(serviceTypeId) || serviceTypesRequested);
  const { data: serviceTypes, isLoading: isLoadingServiceTypes } = useServiceTypes({ enabled: shouldLoadServiceTypes });
  const sortValue = parseRequestSort(filters.get('sort') ?? sort);

  return (
    <div className={cn('space-y-2.5', className)}>
      <FilterSearchInput
        id="requests-filter-search"
        value={q ?? ''}
        placeholder="ابحث في العنوان أو الوصف…"
        label="بحث"
        onApply={(value) => filters.update('q', value, { mode: 'replace' })}
      />

      <div className="grid grid-cols-2 gap-2">
        <FilterCitySelect
          id="requests-filter-city"
          label="المدينة"
          value={city ?? ''}
          onChange={(value) => filters.update('city', value, { mode: 'replace' })}
        />
        {type === 'SERVICE' ? (
          <FilterSelect
            id="requests-filter-service-type"
            label="المجال"
            value={serviceTypeId ?? ''}
            allLabel="كل المجالات"
            onOpenChange={(open) => { if (open) setServiceTypesRequested(true); }}
            options={(serviceTypes ?? []).filter((item) => item.isActive).map((item) => ({ value: item.id, label: item.nameAr }))}
            onChange={(value) => filters.update('serviceTypeId', value, { mode: 'replace' })}
          />
        ) : (
          <FilterSelect
            id="requests-filter-service-type-disabled"
            label="المجال"
            value=""
            allLabel="كل المجالات"
            disabled
            options={[]}
            onChange={() => undefined}
          />
        )}
        {type === 'SERVICE' && isLoadingServiceTypes && !serviceTypes?.length ? (
          <p className="col-span-2 text-xs text-muted-foreground" role="status">جارٍ تحميل المجالات…</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-2">
        {totalLabel ? <p className="min-w-0 text-sm-tight font-extrabold text-foreground">{totalLabel}</p> : <span />}
        <div className="flex items-end gap-2">
          <div className="w-44">
            <FilterSelect
              id="requests-filter-sort"
              label="الترتيب"
              value={sortValue}
              options={REQUEST_SORT_OPTIONS}
              onChange={(value) => filters.update('sort', value === 'newest' ? null : value, { mode: 'replace' })}
            />
          </div>
          {filters.activeCount > 0 ? (
            <div className="w-40">
              <FilterResetButton onClick={() => filters.clear([], 'replace')} label="مسح الفلاتر" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
