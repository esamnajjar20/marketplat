/**
 * SaveSearchButton — reads the currently-applied search/filter params
 * (same params the calling page's own results component reads for its
 * query) and offers to store them as a SavedSearch.
 *
 * PLATFORM-WIDE-01: originally ads-only (hardcoded to the ads/search
 * result params: q/city/categoryId/condition/minPrice/maxPrice). Now
 * generalized to also cover products (/products) and services
 * (/services) directory pages, whose URL params differ in two ways
 * from the ads/search page:
 *   - the free-text query param is named `search`, not `q`
 *     (ProductsFilters.tsx / ServiceListingsGrid.tsx read `search`,
 *     while ads/SearchResults.tsx and the unified search page read
 *     `q`) — `queryParamKey` picks which one this instance reads.
 *   - neither Product nor ServiceListing carries a city or condition
 *     column (see saved-searches.validation.ts's own comment), so
 *     those two keys are only read/offered when `type === 'ads'`.
 * `type` is stored inside the filters payload itself (see
 * savedSearch.types.ts) and read back by the backend matcher
 * (saved-searches.service.ts) to route a newly created ad/product/
 * service listing to the right matching function.
 */
'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BellPlus } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { useCreateSavedSearch } from '@/hooks/mutations/useSavedSearchMutations';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { toast } from 'sonner';
import type { SavedSearchFilters, SavedSearchType } from '@/types/savedSearch.types';
import type { AdCondition } from '@/types/ad.types';

interface SaveSearchButtonProps {
  /** Which entity kind this button's page searches. Defaults to 'ads'
   * so every existing call site (ads/SearchResults.tsx,
   * categories/[slug]) keeps working unchanged. */
  type?: SavedSearchType;
  /** URL param name for the free-text query. 'q' for the ads/search
   * pages, 'search' for /products and /services. Defaults to 'q'. */
  queryParamKey?: 'q' | 'search';
}

/** Builds the filters payload from URL search params, dropping any key
 * that isn't a real filter (page/sortBy/sortOrder aren't matching
 * criteria — see saved-searches.validation.ts's schema, which has no
 * equivalents for those) and dropping city/condition entirely for
 * non-ads types (see this file's own doc comment for why). */
function filtersFromParams(
  sp: URLSearchParams,
  type: SavedSearchType,
  queryParamKey: 'q' | 'search'
): SavedSearchFilters {
  const filters: SavedSearchFilters = { type };
  const q = sp.get(queryParamKey);
  const categoryId = sp.get('categoryId');
  const minPrice = sp.get('minPrice');
  const maxPrice = sp.get('maxPrice');

  if (q) filters.q = q;
  if (categoryId) filters.categoryId = categoryId;
  if (minPrice) filters.minPrice = Number(minPrice);
  if (maxPrice) filters.maxPrice = Number(maxPrice);

  if (type === 'ads') {
    const city = sp.get('city');
    const condition = sp.get('condition');
    if (city) filters.city = city;
    if (condition) filters.condition = condition as AdCondition;
  }

  return filters;
}

/** Short human-readable default label built from the same filters, so
 * the dialog doesn't open on a blank required field every time. */
function defaultLabel(filters: SavedSearchFilters): string {
  const parts: string[] = [];
  if (filters.q) parts.push(filters.q);
  if (filters.city) parts.push(filters.city);
  if (filters.minPrice || filters.maxPrice) {
    parts.push(`${filters.minPrice ?? '0'}–${filters.maxPrice ?? '∞'} ₪`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'بحث محفوظ';
}

const NOTICE_TEXT: Record<SavedSearchType, string> = {
  ads: 'سنُعلمك عند نشر إعلان جديد يطابق هذا البحث.',
  products: 'سنُعلمك عند نشر منتج جديد يطابق هذا البحث.',
  services: 'سنُعلمك عند نشر خدمة جديدة تطابق هذا البحث.',
};

export function SaveSearchButton({ type = 'ads', queryParamKey = 'q' }: SaveSearchButtonProps = {}) {
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const isAuth = useAuthStore(selectIsAuthenticated);
  const createSavedSearch = useCreateSavedSearch();

  const filters = filtersFromParams(sp, type, queryParamKey);
  // `type` alone isn't a real criterion — mirrors the backend schema's
  // own "at least one filter is required" refine, which excludes it
  // the same way.
  const hasAnyFilter = Object.keys(filters).some((k) => k !== 'type');

  function handleOpen() {
    if (!isAuth) { toast.error('يرجى تسجيل الدخول أولاً'); return; }
    if (!hasAnyFilter) { toast.error('أضف كلمة بحث أو فلتر واحد على الأقل'); return; }
    setLabel(defaultLabel(filters));
    setOpen(true);
  }

  function handleSubmit() {
    if (!label.trim()) { toast.error('يرجى إدخال اسم للبحث'); return; }
    createSavedSearch.mutate(
      { label: label.trim(), filters },
      { onSuccess: () => setOpen(false) }
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleOpen}>
        <BellPlus className="h-4 w-4" />
        حفظ البحث
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>حفظ البحث</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {NOTICE_TEXT[type]}
            </p>
            <div className="space-y-1.5">
              <label htmlFor="saved-search-label" className="text-sm font-medium">اسم البحث</label>
              <Input
                id="saved-search-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={100}
                placeholder="مثال: آيفون في النصيرات"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button onClick={handleSubmit} disabled={createSavedSearch.isPending}>
                {createSavedSearch.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
