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
import { Badge } from '@/components/ui/badge';
import { SearchFilters } from './SearchFilters';

// FIX SHEET-BADGE-SORT-01: count mirrors SearchResults hasActiveFilters
// (includes sort ≠ relevance). `q` excluded — it is the query, not a filter.
const IS_SORT_ACTIVE = (v: string | null) => v !== null && v !== 'relevance';

/**
 * Mobile filter entry — Phase 3: clearer trigger badge + sheet header
 * aligned with CreateSheet / ExploreSheet.
 */
export function SearchFiltersSheet() {
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();

  const activeCount = [
    'city', 'categoryId', 'minPrice', 'maxPrice', 'condition',
  ].filter((key) => Boolean(sp.get(key))).length
    + (sp.get('lat') || sp.get('lng') ? 1 : 0)
    + (IS_SORT_ACTIVE(sp.get('sort')) ? 1 : 0);

  return (
    <div className="lg:hidden">
      <Button
        variant="outline"
        className="h-10 w-full justify-center gap-2 rounded-xl"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        تصفية
        {activeCount > 0 && (
          <Badge
            size="sm"
            variant="default"
            className="min-w-5 justify-center px-1.5"
            aria-label={`${activeCount} فلاتر نشطة`}
          >
            {activeCount}
          </Badge>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex max-h-[92dvh] flex-col p-0">
          <SheetHeader className="border-b border-border/60 px-4 pb-3 pt-1">
            <SheetTitle className="text-base font-bold">تصفية النتائج</SheetTitle>
            <p className="text-2xs text-muted-foreground sm:text-xs">
              الموقع والمدينة أولًا — الفئة تحت «خيارات أكثر». التغييرات تُطبَّق فورًا.
            </p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            <SearchFilters />
          </div>
          <div className="sticky bottom-0 border-t border-border/60 bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
            <Button
              type="button"
              className="h-11 w-full rounded-xl font-semibold"
              onClick={() => setOpen(false)}
            >
              عرض النتائج
              {activeCount > 0 ? ` (${activeCount})` : ''}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
