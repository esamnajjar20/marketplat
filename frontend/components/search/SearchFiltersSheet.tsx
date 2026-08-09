'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shared/ui/Sheet';
import { SearchFilters } from './SearchFilters';

// Keys SearchFilters itself writes via update() — city/categoryId/sort
// (excluding sort's own default 'relevance', which isn't really an
// "active" filter) plus the nearby-search lat/lng pair it sets via
// SearchNearbyToggle. q/type/page are the page's own params, not
// filters, so they're deliberately excluded from the count.
const FILTER_KEYS = ['city', 'categoryId', 'lat', 'lng'] as const;

/**
 * FIX P1-2: on mobile, SearchFilters previously rendered inline above
 * the results (DOM order: <aside> before <main> in a grid-cols-1
 * layout) — a full filter panel (location, category, city, sort) stood
 * between the user and any actual result. This wraps the exact same
 * SearchFilters component (unmodified — it's already URL-driven via
 * useSearchParams/router.push, so it works identically inside a sheet)
 * behind a "تصفية" trigger button, shown only below `lg` where the
 * always-visible <aside> is hidden. The active-filter count on the
 * button mirrors what a "N filters active" chip does on most search
 * UIs, so the user isn't guessing whether anything is set before opening it.
 */
export function SearchFiltersSheet() {
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();

  const activeCount = FILTER_KEYS.filter((key) => sp.get(key)).length
    // lat/lng are a pair for one concept (nearby search) — count them
    // as at most one active filter, not two.
    - (sp.get('lat') && sp.get('lng') ? 1 : 0);

  return (
    <div className="lg:hidden">
      <Button variant="outline" className="w-full justify-center gap-2" onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-4 w-4" />
        تصفية
        {activeCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="p-0">
          <SheetHeader>
            <SheetTitle>تصفية النتائج</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <SearchFilters />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
