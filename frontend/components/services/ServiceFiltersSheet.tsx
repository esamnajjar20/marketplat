'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shared/ui/Sheet';
import { ServiceCategoryFilter } from './ServiceCategoryFilter';

/** URL keys written by ServiceCategoryFilter */
const FILTER_KEYS = [
  'search',
  'serviceTypeId',
  'categoryId',
  'city',
  'serviceLocation',
  'minPrice',
  'maxPrice',
  'attributeFilters',
  'sortBy',
  'sortOrder',
] as const;

/**
 * Mobile-only filters for /services — mirrors ProductsFiltersSheet / StoresFiltersSheet.
 * Desktop keeps the sidebar (ListPageShell hides sidebar below lg).
 */
export function ServiceFiltersSheet() {
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();

  const activeCount = FILTER_KEYS.filter((key) => {
    const v = sp.get(key);
    if (!v) return false;
    // ignore default sort
    if (key === 'sortBy' && v === 'createdAt') return false;
    if (key === 'sortOrder' && v === 'desc') return false;
    return true;
  }).length;

  return (
    <div className="lg:hidden">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-center gap-2"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        تصفية
        {activeCount > 0 ? (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">
            {activeCount}
          </span>
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="p-0">
          <SheetHeader>
            <SheetTitle>تصفية الخدمات</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <ServiceCategoryFilter />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
