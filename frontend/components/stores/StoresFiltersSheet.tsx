'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shared/ui/Sheet';
import { StoresFilters } from './StoresFilters';

// Keys StoresFilters itself writes via update() — search/city (sort no
// longer lives here, FIX P2-08). Mirrors search/SearchFiltersSheet.tsx
// and ads/SearchFiltersSheet.tsx's identical FILTER_KEYS convention.
const FILTER_KEYS = ['search', 'city', 'type'] as const;

/**
 * FIX P2-09: /stores previously rendered StoresFilters inline above the
 * results on every breakpoint (no `hidden lg:block` on its <aside>,
 * unlike /search and the ads category page) — on mobile a user had to
 * scroll past the full filter panel before seeing a single store. This
 * wraps the exact same StoresFilters component (unmodified — already
 * URL-driven via useSearchParams/router.push, so it works identically
 * inside a sheet) behind a "تصفية" trigger, shown only below `lg`,
 * mirroring FIX P1-2's identical fix for /search and the ads category
 * page.
 */
export function StoresFiltersSheet() {
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
            <StoresFilters />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
