'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, Search } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
import { Checkbox } from '@/components/shared/ui/Checkbox';
import { CITIES, ROUTES } from '@/lib/constants';

/**
 * PROMO-1 (Phase 12, full scope): mirrors StoresFilters.tsx's
 * URL-driven shape/behavior exactly (same update() pattern, same
 * select styling) — ProductsGrid already reads and applies
 * search/city/hasPromotion from the URL in full (see its own doc
 * comment), this was only ever missing a visible filter UI, same gap
 * StoresFilters originally closed for /stores (FIX BUG-02).
 *
 * hasPromotion is a plain Checkbox (native <input type="checkbox">,
 * see that component's own doc for why no Radix here) rather than a
 * Select — it's a single boolean toggle ("عروض فقط"), not a set of
 * mutually exclusive options.
 */
export function ProductsFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const search = sp.get('search') ?? '';

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value); else params.delete(key);
    params.delete('page');
    router.push(`${ROUTES.products}?${params.toString()}`);
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <SlidersHorizontal className="h-4 w-4" />
        تصفية النتائج
      </div>

      <div className="space-y-1.5">
        <label htmlFor="products-filter-search" className="text-xs text-muted-foreground font-medium">بحث</label>
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          {/* key={search} forces a remount when the `search` param
              changes via browser back/forward, so the uncontrolled
              defaultValue doesn't go stale relative to the URL/results
              — same fix ProductsFilters mirrors from StoresFilters. */}
          <input
            id="products-filter-search"
            key={search}
            type="search"
            placeholder="ابحث عن منتج…"
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
        <label htmlFor="products-filter-city" className="text-xs text-muted-foreground font-medium">المدينة</label>
        <Select value={sp.get('city') || 'ALL'} onValueChange={(v) => update('city', v === 'ALL' ? '' : v)}>
          <SelectTrigger id="products-filter-city" className="w-full"><SelectValue placeholder="كل المدن" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل المدن</SelectItem>
            {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox
          checked={sp.get('hasPromotion') === 'true'}
          onChange={(e) => update('hasPromotion', e.target.checked ? 'true' : '')}
        />
        عروض فقط 🔥
      </label>
    </div>
  );
}
