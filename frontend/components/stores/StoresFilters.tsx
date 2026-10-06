'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, Search } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
import { CITIES, ROUTES } from '@/lib/constants';
import { useStoreTypes } from '@/hooks/queries/useStoreTypes';

/**
 * StoresGrid (components/stores/StoresGrid.tsx) already
 * reads and applies search/city/sortBy/sortOrder from the URL in
 * full — the data layer was always complete. Only a visible filter UI
 * was missing from the /stores page, leaving those params reachable
 * only by hand-editing the URL. Mirrors ServiceCategoryFilter's and
 * ads/SearchFilters' shape/behavior for consistency with the rest of
 * the app (same update() pattern, same select styling).
 *
 * (audit item #8): sort used to have its own combined
 * sortBy_sortOrder Select right in this panel. It's now SearchSortBar,
 * rendered independently above the results (see
 * app/(public)/stores/page.tsx) instead of nested here.
 */
export function StoresFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const search = sp.get('search') ?? '';
  const { data: storeTypes = [] } = useStoreTypes();

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value); else params.delete(key);
    params.delete('page');
    router.push(`${ROUTES.stores}?${params.toString()}`);
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <SlidersHorizontal className="h-4 w-4" />
        تصفية النتائج
      </div>

      <div className="space-y-1.5">
        <label htmlFor="stores-filter-search" className="text-xs text-muted-foreground font-medium">بحث</label>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          {/* FIX BUG-XX: key={search} forces a remount when the `search`
              param changes via browser back/forward, so the uncontrolled
              defaultValue doesn't go stale relative to the URL/results. */}
          <input
            id="stores-filter-search"
            key={search}
            type="search"
            placeholder="ابحث عن متجر…"
            defaultValue={search}
            onKeyDown={(e) => {
              if (e.key === 'Enter') update('search', (e.target as HTMLInputElement).value);
            }}
            onBlur={(e) => update('search', e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent ps-9 pe-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="stores-filter-type" className="text-xs text-muted-foreground font-medium">نوع المتجر</label>
        <Select value={sp.get('type') || 'ALL'} onValueChange={(v) => update('type', v === 'ALL' ? '' : v)}>
          <SelectTrigger id="stores-filter-type" className="w-full"><SelectValue placeholder="كل الأنواع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل الأنواع</SelectItem>
            {storeTypes.map((type) => <SelectItem key={type.id} value={type.slug}>{type.nameAr}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="stores-filter-city" className="text-xs text-muted-foreground font-medium">المدينة</label>
        <Select value={sp.get('city') || 'ALL'} onValueChange={(v) => update('city', v === 'ALL' ? '' : v)}>
          <SelectTrigger id="stores-filter-city" className="w-full"><SelectValue placeholder="كل المدن" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل المدن</SelectItem>
            {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

    </div>
  );
}
