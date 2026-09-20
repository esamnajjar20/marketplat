'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/shared/ui/Sheet';
import { SearchFilters } from './SearchFilters';

// FIX SHEET-BADGE-SORT-01: this list used to be FILTER_KEYS.filter(get)
// minus a lat/lng dedup, and it silently ignored `sort`. On mobile the
// sort control lives in SearchSortBar (above the results, not inside
// the sheet) -- so a user who set sort=newest would open the filter
// sheet, see a badge of 0, and reasonably conclude nothing was
// filtered. SearchResults' own hasActiveFilters already counts
// sort !== 'relevance' -- mirroring that here keeps the desktop reset
// button and the mobile badge in agreement. `q` is still deliberately
// excluded: it is the query, not a filter, and SearchFilters' own
// reset button preserves it for the same reason.
const IS_SORT_ACTIVE = (v: string | null) => v !== null && v !== 'relevance';

/**
 * Mobile filter entry — short trigger + sheet. Closing the sheet is the
 * "apply" gesture (URL already updated live); count badge shows active set.
 */
export function SearchFiltersSheet() {
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();

  const activeCount =
    (sp.get('city')            ? 1 : 0) +
    (sp.get('categoryId')      ? 1 : 0) +
    (sp.get('lat') && sp.get('lng') ? 1 : 0) +
    (IS_SORT_ACTIVE(sp.get('sort'))  ? 1 : 0);

  return (
    <div className="lg:hidden">
      <Button
        variant="outline"
        className="w-full justify-center gap-2"
        onClick={() => setOpen(true)}
        aria-expanded={open}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        تصفية
        {activeCount > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
            {activeCount}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex max-h-[92dvh] flex-col p-0">
          <SheetHeader>
            <SheetTitle>تصفية النتائج</SheetTitle>
            <p className="px-1 text-sm text-muted-foreground">
              الموقع والمدينة أولًا — الفئة تحت «خيارات أكثر». التغييرات تُطبَّق فورًا.
            </p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            <SearchFilters />
          </div>
          <div className="sticky bottom-0 border-t bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Button type="button" className="w-full font-semibold" onClick={() => setOpen(false)}>
              عرض النتائج
              {activeCount > 0 ? ` (${activeCount})` : ''}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
