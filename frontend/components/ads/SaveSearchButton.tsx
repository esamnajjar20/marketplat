/**
 * SaveSearchButton — reads the currently-applied search/filter params
 * (same params SearchResults.tsx reads for its own query) and offers to
 * store them as a SavedSearch. Placed in the search results toolbar
 * rather than inside SearchFilters.tsx itself, since it needs to read
 * `q` too (SearchFilters.tsx only manages the category/city/condition/
 * price/sort controls — `q` comes from the top-level search box that
 * lives outside that component).
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
import type { SavedSearchFilters } from '@/types/savedSearch.types';
import type { AdCondition } from '@/types/ad.types';

/** Builds the filters payload from URL search params, dropping any key
 * that isn't a real filter (page/sortBy/sortOrder aren't matching
 * criteria — see saved-searches.validation.ts's schema, which has no
 * equivalents for those). */
function filtersFromParams(sp: URLSearchParams): SavedSearchFilters {
  const filters: SavedSearchFilters = {};
  const q = sp.get('q');
  const city = sp.get('city');
  const categoryId = sp.get('categoryId');
  const condition = sp.get('condition');
  const minPrice = sp.get('minPrice');
  const maxPrice = sp.get('maxPrice');

  if (q) filters.q = q;
  if (city) filters.city = city;
  if (categoryId) filters.categoryId = categoryId;
  if (condition) filters.condition = condition as AdCondition;
  if (minPrice) filters.minPrice = Number(minPrice);
  if (maxPrice) filters.maxPrice = Number(maxPrice);

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

export function SaveSearchButton() {
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const isAuth = useAuthStore(selectIsAuthenticated);
  const createSavedSearch = useCreateSavedSearch();

  const filters = filtersFromParams(sp);
  const hasAnyFilter = Object.keys(filters).length > 0;

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
              سنُعلمك عند نشر إعلان جديد يطابق هذا البحث.
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
