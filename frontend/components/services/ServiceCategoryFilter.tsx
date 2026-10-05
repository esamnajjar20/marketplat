'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, Search } from 'lucide-react';
import { CITIES, ROUTES } from '@/lib/constants';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { useServiceTypes } from '@/hooks/queries/useServiceTypes';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';

const LOCATION_LABELS: Record<string, string> = {
  AT_CUSTOMER: 'لدى العميل',
  AT_PROVIDER: 'لدى مقدم الخدمة',
  REMOTE: 'عن بُعد',
};

export function ServiceCategoryFilter() {
  const router = useRouter();
  const sp = useSearchParams();
  const { data: categories } = useServiceCategories();
  const { data: serviceTypes } = useServiceTypes();
  const selectedType = serviceTypes?.find((type) => type.id === sp.get('serviceTypeId'));
  const availableLocations = Object.entries(LOCATION_LABELS).filter(([value]) => {
    const caps = selectedType?.capabilities;
    if (!caps) return true;
    if (value === 'REMOTE') return caps.remote !== false;
    if (value === 'AT_CUSTOMER') return caps.atCustomer !== false;
    if (value === 'AT_PROVIDER') return caps.atProvider !== false;
    return true;
  });

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value); else params.delete(key);
    params.delete('page');
    router.push(`${ROUTES.services}?${params.toString()}`);
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <SlidersHorizontal className="h-4 w-4" />
        تصفية النتائج
      </div>

      {/*
        FIX BUG-07: ServiceListingsGrid (components/services/ServiceListingsGrid.tsx)
        has always read and applied `search` from the URL in full — only
        a text input to actually set it was missing from this filter
        panel, so the only way to search services by keyword was to
        hand-edit the URL's ?search= param.
      */}
      <div className="space-y-1.5">
        <label htmlFor="svc-filter-search" className="text-xs text-muted-foreground font-medium">بحث</label>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          {/* FIX BUG-XX: key={...} forces a remount when the param changes
              via browser back/forward, so the uncontrolled defaultValue
              doesn't go stale relative to the URL/results. Applied here
              and to minPrice/maxPrice below — same root cause. */}
          <input
            id="svc-filter-search"
            key={sp.get('search') ?? ''}
            type="search"
            placeholder="ابحث عن خدمة…"
            defaultValue={sp.get('search') ?? ''}
            onKeyDown={(e) => {
              if (e.key === 'Enter') update('search', (e.target as HTMLInputElement).value);
            }}
            onBlur={(e) => update('search', e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent ps-9 pe-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="svc-filter-type" className="text-xs text-muted-foreground font-medium">مجال الخدمة</label>
        <Select value={sp.get('serviceTypeId') || 'ALL'} onValueChange={(v) => update('serviceTypeId', v === 'ALL' ? '' : v)}>
          <SelectTrigger id="svc-filter-type" className="w-full"><SelectValue placeholder="كل المجالات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل المجالات</SelectItem>
            {serviceTypes?.map((type) => <SelectItem key={type.id} value={type.id}>{type.nameAr}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="svc-filter-category" className="text-xs text-muted-foreground font-medium">الفئة</label>
        <Select value={sp.get('categoryId') || 'ALL'} onValueChange={(v) => update('categoryId', v === 'ALL' ? '' : v)}>
          <SelectTrigger id="svc-filter-category" className="w-full"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل الفئات</SelectItem>
            {categories?.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>{cat.nameAr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="svc-filter-city" className="text-xs text-muted-foreground font-medium">المدينة</label>
        <Select value={sp.get('city') || 'ALL'} onValueChange={(v) => update('city', v === 'ALL' ? '' : v)}>
          <SelectTrigger id="svc-filter-city" className="w-full"><SelectValue placeholder="كل المدن" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل المدن</SelectItem>
            {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="svc-filter-location" className="text-xs text-muted-foreground font-medium">موقع تقديم الخدمة</label>
        <Select value={sp.get('serviceLocation') || 'ALL'} onValueChange={(v) => update('serviceLocation', v === 'ALL' ? '' : v)}>
          <SelectTrigger id="svc-filter-location" className="w-full"><SelectValue placeholder="كل المواقع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل المواقع</SelectItem>
            {availableLocations.map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label htmlFor="svc-filter-min" className="text-xs text-muted-foreground font-medium">أقل سعر</label>
          <input
            id="svc-filter-min"
            key={sp.get('minPrice') ?? ''}
            type="number"
            min="0"
            defaultValue={sp.get('minPrice') ?? ''}
            onBlur={(e) => update('minPrice', e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="svc-filter-max" className="text-xs text-muted-foreground font-medium">أعلى سعر</label>
          <input
            id="svc-filter-max"
            key={sp.get('maxPrice') ?? ''}
            type="number"
            min="0"
            defaultValue={sp.get('maxPrice') ?? ''}
            onBlur={(e) => update('maxPrice', e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="svc-filter-sort" className="text-xs text-muted-foreground font-medium">الترتيب</label>
        <Select
          value={`${sp.get('sortBy') || 'createdAt'}:${sp.get('sortOrder') || 'desc'}`}
          onValueChange={(v) => {
            const [sortBy, sortOrder] = v.split(':');
            update('sortBy', sortBy === 'createdAt' ? '' : (sortBy ?? ''));
            // Always set sortOrder explicitly when non-default pair
            const params = new URLSearchParams(sp.toString());
            if (sortBy && sortBy !== 'createdAt') params.set('sortBy', sortBy);
            else params.delete('sortBy');
            if (sortOrder && sortOrder !== 'desc') params.set('sortOrder', sortOrder);
            else params.delete('sortOrder');
            params.delete('page');
            router.push(`${ROUTES.services}?${params.toString()}`);
          }}
        >
          <SelectTrigger id="svc-filter-sort" className="w-full"><SelectValue placeholder="الأحدث" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt:desc">الأحدث</SelectItem>
            <SelectItem value="createdAt:asc">الأقدم</SelectItem>
            <SelectItem value="price:asc">السعر: من الأقل</SelectItem>
            <SelectItem value="price:desc">السعر: من الأعلى</SelectItem>
            <SelectItem value="views:desc">الأكثر مشاهدة</SelectItem>
          </SelectContent>
        </Select>
      </div>

    </div>
  );
}

