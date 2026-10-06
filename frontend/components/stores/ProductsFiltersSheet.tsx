'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shared/ui/Sheet';
import { ProductsFilters } from './ProductsFilters';

// Keys ProductsFilters itself writes via update() — mirrors
// StoresFiltersSheet.tsx's identical FILTER_KEYS convention.
const FILTER_KEYS = ['search', 'city', 'hasPromotion'] as const;

/**
 * PROMO-1 (, full scope): wraps ProductsFilters behind a
 * "تصفية" trigger on mobile, shown only below `lg` — same
 * inline-on-mobile-forces-scrolling-past-the-panel fix
 * StoresFiltersSheet applied to /stores (), applied here for
 * the first time since /products never had a filter sidebar at all
 * until this pass.
 */
export function ProductsFiltersSheet() {
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();

  const activeCount = FILTER_KEYS.filter((key) => sp.get(key)).length;

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
            <ProductsFilters />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
