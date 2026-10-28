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

const IS_SORT_ACTIVE = (v: string | null) => v !== null && v !== 'relevance';

/**
 * Mobile filter entry — تصميم المرجع: شارة عدد + عنوان تصفية النتائج + زر عرض النتائج.
 */
export function SearchFiltersSheet() {
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();

  const activeCount =
    ['city', 'categoryId', 'minPrice', 'maxPrice', 'condition'].filter((key) => Boolean(sp.get(key)))
      .length +
    (sp.get('lat') || sp.get('lng') ? 1 : 0) +
    (IS_SORT_ACTIVE(sp.get('sort')) ? 1 : 0);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        className="relative inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[#EAE3D6] bg-white px-3 text-xs font-bold text-foreground dark:border-border dark:bg-card"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
        {activeCount > 0 ? (
          <span
            className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#397F56] px-1 text-[10px] font-extrabold text-white"
            aria-label={`${activeCount} فلاتر نشطة`}
          >
            {activeCount}
          </span>
        ) : null}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex max-h-[92dvh] flex-col rounded-t-3xl border-[#EAE3D6] bg-[#FBF9F4] p-0 dark:bg-background">
          <SheetHeader className="border-b border-[#EAE3D6] px-4 pb-3 pt-2 dark:border-border">
            <SheetTitle className="text-base font-extrabold">تصفية النتائج</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">
            <SearchFilters />
          </div>
          <div className="sticky bottom-0 flex gap-2 border-t border-[#EAE3D6] bg-[#FBF9F4]/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm dark:border-border dark:bg-background/95">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-full border-[#EAE3D6] font-bold"
              onClick={() => {
                // reset is handled inside filters via clear; close only
                setOpen(false);
              }}
            >
              إغلاق
            </Button>
            <Button
              type="button"
              className="h-11 flex-[1.4] rounded-full bg-[#397F56] font-bold text-white hover:bg-[#397F56]/90"
              onClick={() => setOpen(false)}
            >
              عرض النتائج{activeCount > 0 ? ` (${activeCount})` : ''}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
