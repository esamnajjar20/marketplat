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
 *
 * TYPE-PICK-STEP: `type` is now optional. The unified /search page's
 * "الكل" tab has no single entity kind to attach a saved search to (a
 * SavedSearch always matches exactly one of ads/products/services —
 * see saved-searches.service.ts's per-type matcher), so when the
 * caller omits `type` this opens on an extra first step asking which
 * kind to save as, then proceeds through the same label step as
 * every other call site. Every existing call site keeps passing an
 * explicit `type` and is completely unaffected — this step only ever
 * appears when `type` is omitted.
 */
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BellPlus, Megaphone, Package, Wrench } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { useCreateSavedSearch } from '@/hooks/mutations/useSavedSearchMutations';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';
import type { SavedSearchFilters, SavedSearchType } from '@/types/savedSearch.types';
import type { AdCondition } from '@/types/ad.types';

interface SaveSearchButtonProps {
  /** Which entity kind this button's page searches. Every call site
   * with a single matchable entity kind (ads/search, /products,
   * /services) passes this explicitly. Omit only on the unified
   * /search page's "الكل" tab, where it's genuinely ambiguous — the
   * button then asks the visitor to pick one before saving (see
   * TYPE-PICK-STEP above). */
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
  ads: 'نحفظ هذا البحث ونرسل لك إشعاراً عند ظهور إعلان جديد مطابق — حتى لا تفوّت الفرصة.',
  products: 'نحفظ هذا البحث ونرسل لك إشعاراً عند ظهور منتج جديد مطابق.',
  services: 'نحفظ هذا البحث ونرسل لك إشعاراً عند ظهور خدمة جديدة مطابقة.',
};

// TYPE-PICK-STEP: order matches SearchTabs.tsx's own tab order for the
// three saveable types (المنتجات، الإعلانات، الخدمات — minus الكل and
// المحلات, neither saveable — see SearchResults.tsx's own comment on
// why stores has no matcher).
const TYPE_CHOICES: { type: SavedSearchType; label: string; icon: typeof Megaphone }[] = [
  { type: 'products', label: 'منتج',  icon: Package },
  { type: 'ads',       label: 'إعلان', icon: Megaphone },
  { type: 'services',  label: 'خدمة',  icon: Wrench },
];

export function SaveSearchButton({ type, queryParamKey = 'q' }: SaveSearchButtonProps = {}) {
  const sp = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // TYPE-PICK-STEP: only relevant when `type` prop is omitted — starts
  // on 'type' so the picker shows first; call sites that pass `type`
  // never see this step (handleOpen skips straight past it below).
  const [step, setStep] = useState<'type' | 'label'>('type');
  const [selectedType, setSelectedType] = useState<SavedSearchType | null>(null);
  const [label, setLabel] = useState('');
  const isAuth = useAuthStore(selectIsAuthenticated);
  const createSavedSearch = useCreateSavedSearch();

  // The type actually in effect for building filters/label/notice —
  // the prop when given, otherwise whatever the picker step set.
  const effectiveType = type ?? selectedType;

  function openForType(t: SavedSearchType) {
    const filters = filtersFromParams(sp, t, queryParamKey);
    // `type` alone isn't a real criterion — mirrors the backend
    // schema's own "at least one filter is required" refine, which
    // excludes it the same way.
    const hasAnyFilter = Object.keys(filters).some((k) => k !== 'type');
    if (!hasAnyFilter) { toast.error('أضف كلمة بحث أو فلتر واحد على الأقل'); return false; }
    setSelectedType(t);
    setLabel(defaultLabel(filters));
    setStep('label');
    return true;
  }

  function handleOpen() {
    // same pattern as AdCard/StickyContactBar —
    // redirect to login with the current page as the return target,
    // rather than a bare toast that stalls the save.
    if (!isAuth) {
      const returnTo = typeof window !== 'undefined' ? window.location.pathname + window.location.search : ROUTES.search;
      toast.error('سجّل الدخول لحفظ البحث');
      router.push(`${ROUTES.login}?from=${encodeURIComponent(returnTo)}`);
      return;
    }
    if (type) {
      // Existing single-type flow, unchanged: filter-check happens
      // immediately since there's nothing to pick.
      if (openForType(type)) setOpen(true);
      return;
    }
    // TYPE-PICK-STEP: open straight on the picker — the filter check
    // happens per-type once the visitor picks one (handleChooseType),
    // since which filters count as "real" depends on the chosen type
    // (e.g. `condition` only ever applies to ads).
    setStep('type');
    setSelectedType(null);
    setOpen(true);
  }

  function handleChooseType(t: SavedSearchType) {
    openForType(t);
  }

  function handleSubmit() {
    if (!effectiveType) return;
    if (!label.trim()) { toast.error('يرجى إدخال اسم للبحث'); return; }
    const filters = filtersFromParams(sp, effectiveType, queryParamKey);
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
          {step === 'type' || !effectiveType ? (
            <>
              <DialogHeader><DialogTitle>حفظ البحث كـ...</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  اختر نوع النتائج التي تريد حفظ هذا البحث لها.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {TYPE_CHOICES.map(({ type: t, label: l, icon: Icon }) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleChooseType(t)}
                      className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/5"
                    >
                      <Icon className="h-5 w-5 text-primary" />
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader><DialogTitle>حفظ البحث</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <p className="text-sm text-muted-foreground">
                  {NOTICE_TEXT[effectiveType]}
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
                  {/* Only the type-picker flow (type prop omitted) can
                      go back — the fixed-type flow never had a
                      previous step to return to. */}
                  {!type && (
                    <Button variant="ghost" onClick={() => setStep('type')}>رجوع</Button>
                  )}
                  <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
                  <Button onClick={handleSubmit} disabled={createSavedSearch.isPending}>
                    {createSavedSearch.isPending ? 'جارٍ الحفظ…' : 'حفظ'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
