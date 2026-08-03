'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, Search } from 'lucide-react';
import { CITIES, ROUTES } from '@/lib/constants';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';

const LOCATION_LABELS: Record<string, string> = {
  AT_CUSTOMER: 'لدى العميل',
  AT_PROVIDER: 'لدى مقدم الخدمة',
  REMOTE: 'عن بُعد',
};

export function ServiceCategoryFilter() {
  const router = useRouter();
  const sp = useSearchParams();
  const { data: categories } = useServiceCategories();

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
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">بحث</label>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
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
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">الفئة</label>
        <select
          value={sp.get('categoryId') ?? ''}
          onChange={(e) => update('categoryId', e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">كل الفئات</option>
          {categories?.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.nameAr}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">المدينة</label>
        <select
          value={sp.get('city') ?? ''}
          onChange={(e) => update('city', e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">كل المدن</option>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">موقع تقديم الخدمة</label>
        <select
          value={sp.get('serviceLocation') ?? ''}
          onChange={(e) => update('serviceLocation', e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">كل المواقع</option>
          {Object.entries(LOCATION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">أقل سعر</label>
          <input
            type="number"
            min="0"
            defaultValue={sp.get('minPrice') ?? ''}
            onBlur={(e) => update('minPrice', e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">أعلى سعر</label>
          <input
            type="number"
            min="0"
            defaultValue={sp.get('maxPrice') ?? ''}
            onBlur={(e) => update('maxPrice', e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>
    </div>
  );
}
