'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/shared/ui/Sheet';
import { SearchFilters } from './SearchFilters';
import { useAds, useSearchAds } from '@/hooks/queries/useAds';
import { useCategoryBySlug } from '@/hooks/queries/useCategories';
import type { AdSortField } from '@/types/ad.types';

const FILTER_KEYS = ['city', 'condition', 'minPrice', 'maxPrice'] as const;

interface Props {
  categorySlug?: string;
}

/**
 * Mobile filter sheet for ads lists.
 * UX phase-7: shows live result count (from the same React Query cache
 * as SearchResults) so users see impact while adjusting filters.
 */
export function SearchFiltersSheet({ categorySlug }: Props = {}) {
  const [open, setOpen] = useState(false);
  const sp = useSearchParams();
  const { data: slugCategory } = useCategoryBySlug(categorySlug ?? '');

  const q = sp.get('q') ?? '';
  const page = Number(sp.get('page') ?? 1);
  const categoryId = sp.get('categoryId') ?? slugCategory?.id ?? undefined;
  const city = sp.get('city') ?? undefined;
  const condition = sp.get('condition') as 'NEW' | 'USED' | 'REFURBISHED' | undefined;
  const minPrice = sp.get('minPrice') ? Number(sp.get('minPrice')) : undefined;
  const maxPrice = sp.get('maxPrice') ? Number(sp.get('maxPrice')) : undefined;
  const sortBy = (sp.get('sortBy') as AdSortField) ?? 'createdAt';
  const sortOrder = (sp.get('sortOrder') as 'asc' | 'desc') ?? 'desc';

  const isSearch = q.trim().length >= 2;
  const searchQ = useSearchAds({ q, page, categoryId, city, condition, minPrice, maxPrice, sortBy, sortOrder });
  const browseQ = useAds(
    { page, categoryId, city, condition, minPrice, maxPrice, sortBy, sortOrder },
    { enabled: !isSearch },
  );
  const total = (isSearch ? searchQ : browseQ).data?.meta?.total;

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
        {typeof total === 'number' && (
          <span className="text-xs text-muted-foreground">({total} إعلان)</span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="p-0">
          <SheetHeader>
            <SheetTitle>تصفية النتائج</SheetTitle>
            {typeof total === 'number' && (
              <p className="text-sm text-muted-foreground px-1">
                {total === 0 ? 'لا نتائج بهذه الفلاتر' : `${total} إعلان مطابق`}
              </p>
            )}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <SearchFilters categorySlug={categorySlug} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
