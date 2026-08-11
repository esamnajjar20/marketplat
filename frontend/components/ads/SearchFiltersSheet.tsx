'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shared/ui/Sheet';
import { SearchFilters } from './SearchFilters';

// Keys SearchFilters itself writes via update() — category/city/condition/
// price/sort. categoryId is only counted when it isn't already implied by
// categorySlug (the category page's own route param), since that one is
// the page context, not a filter the user actively set.
const FILTER_KEYS = ['city', 'condition', 'minPrice', 'maxPrice'] as const;

interface Props {
  /** Present when rendered from the category page — forwarded to SearchFilters. */
  categorySlug?: string;
}

/**
 * P0 FIX (layout audit §1): on mobile, /categories/[slug] rendered the
 * full ads/SearchFilters panel inline above the results (grid-cols-1,
 * <aside> before <main>, no `hidden lg:block`) — a user had to scroll
 * past category/city/condition/price/sort controls before seeing a
 * single ad. This mirrors the same fix already shipped for /search
 * (components/search/SearchFiltersSheet.tsx, FIX P1-2): the identical
 * filters panel now sits behind a "تصفية" trigger in a bottom sheet
 * below `lg`, while the always-visible <aside> (now `hidden lg:block`)
 * takes over above it — unchanged from before.
 */
export function SearchFiltersSheet({ categorySlug }: Props = {}) {
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();

  const activeCount = FILTER_KEYS.filter((key) => sp.get(key)).length
    // A categoryId param only counts as an active *filter* when it isn't
    // just the category page's own context repeated back as a param.
    + (sp.get('categoryId') && !categorySlug ? 1 : 0);

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
