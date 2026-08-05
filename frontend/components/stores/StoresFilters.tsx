'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, Search } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
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
        <Select value={sp.get('city') || 'ALL'} onValueChange={(v) => update('city', v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-full"><SelectValue placeholder="كل المدن" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل المدن</SelectItem>
            {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">الترتيب</label>
        <Select
          value={`${sp.get('sortBy') ?? 'createdAt'}_${sp.get('sortOrder') ?? 'desc'}`}
          onValueChange={(value) => {
            const [sortBy = 'createdAt', sortOrder = 'desc'] = value.split('_');
            const params = new URLSearchParams(sp.toString());
            params.set('sortBy', sortBy); params.set('sortOrder', sortOrder);
            params.delete('page');
            router.push(`${ROUTES.stores}?${params.toString()}`);
          }}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STORE_SORT_OPTIONS.map((o) => (
              <SelectItem key={`${o.sortBy}_${o.sortOrder}`} value={`${o.sortBy}_${o.sortOrder}`}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
