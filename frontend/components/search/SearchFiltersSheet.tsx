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

const FILTER_KEYS = ['city', 'categoryId', 'lat', 'lng'] as const;

/**
 * Mobile filter entry — short trigger + sheet. Closing the sheet is the
 * "apply" gesture (URL already updated live); count badge shows active set.
 */
export function SearchFiltersSheet() {
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();

  const activeCount =
    FILTER_KEYS.filter((key) => sp.get(key)).length -
    (sp.get('lat') && sp.get('lng') ? 1 : 0);

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
        <SheetContent className="flex flex-col p-0">
          <SheetHeader>
            <SheetTitle>تصفية النتائج</SheetTitle>
            <p className="px-1 text-sm text-muted-foreground">
              الموقع والمدينة أولًا — الفئة تحت «خيارات أكثر». التغييرات تُطبَّق فورًا.
            </p>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-2">
            <SearchFilters />
          </div>
          <div className="border-t bg-background p-4">
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
