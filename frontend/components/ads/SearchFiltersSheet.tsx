'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shared/ui/Sheet';
import { SearchFilters } from './SearchFilters';

const FILTER_KEYS = ['city', 'condition', 'minPrice', 'maxPrice'] as const;

interface Props {
  categorySlug?: string;
}

/** Mobile filter sheet for ads lists. It only reads URL filter state;
 * the results grid owns all listing data and result totals. */
export function SearchFiltersSheet({ categorySlug }: Props = {}) {
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();
  // The results grid owns listing data and totals. This closed sheet must not
  // fetch a second page merely to decorate its trigger with an optional count.

  const activeCount =
    FILTER_KEYS.filter((key) => sp.get(key)).length +
    (sp.get('categoryId') && !categorySlug ? 1 : 0);

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
            <SearchFilters categorySlug={categorySlug} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
