'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, Search } from 'lucide-react';
import { CITIES, ROUTES, STORE_SORT_OPTIONS } from '@/lib/constants';

/**
 * FIX BUG-02: StoresGrid (components/stores/StoresGrid.tsx) already
 * reads and applies search/city/sortBy/sortOrder from the URL in
 * full — the data layer was always complete. Only a visible filter UI
 * was missing from the /stores page, leaving those params reachable
 * only by hand-editing the URL. Mirrors ServiceCategoryFilter's and
 * ads/SearchFilters' shape/behavior for consistency with the rest of
 * the app (same update() pattern, same select styling).
 */
export function StoresFilters() {
  const router = useRouter();
  const sp = useSearchParams();

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
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">بحث</label>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="ابحث عن متجر…"
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
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">الترتيب</label>
        <select
          value={`${sp.get('sortBy') ?? 'createdAt'}_${sp.get('sortOrder') ?? 'desc'}`}
          onChange={(e) => {
            const [sortBy = 'createdAt', sortOrder = 'desc'] = e.target.value.split('_');
            const params = new URLSearchParams(sp.toString());
            params.set('sortBy', sortBy); params.set('sortOrder', sortOrder);
            params.delete('page');
            router.push(`${ROUTES.stores}?${params.toString()}`);
          }}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {STORE_SORT_OPTIONS.map((o) => (
            <option key={`${o.sortBy}_${o.sortOrder}`} value={`${o.sortBy}_${o.sortOrder}`}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
