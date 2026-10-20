'use client';

/**
 * NativeFilterSheet — mobile filter sheet (GPS-free).
 *
 * Location = city select only. No geolocation, no "nearby", no sort=distance.
 * Draft state in Zustand; apply once via router.replace.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/shared/ui/Sheet';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/shared/ui/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shared/ui/Select';
import { CITIES, ROUTES, CONDITION_LABELS } from '@/lib/constants';
import { useCategories } from '@/hooks/queries/useCategories';
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { cn } from '@/lib/utils';
import type { SearchType } from '@/types/search.types';
import {
  PRICE_PRESETS,
  SORT_LABELS,
} from '@/types/filter.types';
import type { AdCondition } from '@/types/filter.types';
import type { SearchSort } from '@/types/search.types';
import {
  useFilterStore,
  parseSearchParams,
  selectDraft,
  selectIsSheetOpen,
} from '@/store/filter.store';
import { hapticSheetOpen, hapticFilterApply } from '@/lib/capacitor/nativeHaptics';

/** Sort options shown in UI — distance excluded (requires GPS). */
const UI_SORT_OPTIONS = (
  Object.keys(SORT_LABELS) as SearchSort[]
).filter((k) => k !== 'distance');

export function NativeFilterSheet() {
  const router = useRouter();
  const sp = useSearchParams();
  const isOpen = useFilterStore(selectIsSheetOpen);
  const draft = useFilterStore(selectDraft);
  const {
    openSheet,
    closeSheet,
    setCity,
    setCategoryId,
    setPrice,
    setCondition,
    setSort,
    resetDraft,
    activeCount,
    toSearchParams,
  } = useFilterStore();

  const [advancedOpen, setAdvancedOpen] = useState(false);

  const type = (draft.type ?? 'all') as SearchType;
  const count = activeCount();

  const { data: adCategories } = useCategories();
  const { data: productCategories } = useProductCategories();
  const { data: serviceCategories } = useServiceCategories();

  const handleOpen = useCallback(() => {
    const fromUrl = parseSearchParams(new URLSearchParams(sp.toString()));
    // Strip any legacy GPS params from draft so Apply never re-publishes them
    const cleaned = { ...fromUrl };
    delete cleaned.lat;
    delete cleaned.lng;
    delete cleaned.radius;
    if (cleaned.sort === 'distance') delete cleaned.sort;
    openSheet(cleaned);
    setAdvancedOpen(Boolean(cleaned.categoryId || cleaned.condition));
    void hapticSheetOpen();
  }, [sp, openSheet]);

  const handleClose = useCallback(() => {
    closeSheet();
  }, [closeSheet]);

  const handleApply = useCallback(() => {
    const params = toSearchParams();
    // Hard guarantee: never write GPS params
    params.delete('lat');
    params.delete('lng');
    params.delete('radius');
    if (params.get('sort') === 'distance') params.delete('sort');
    void hapticFilterApply();
    closeSheet();
    const query = params.toString();
    router.replace(query ? `${ROUTES.search}?${query}` : ROUTES.search);
  }, [toSearchParams, closeSheet, router]);

  const handleReset = useCallback(() => {
    const q = sp.get('q') ?? undefined;
    const typeParam = (sp.get('type') as SearchType) || 'all';
    resetDraft({ q, type: typeParam });
  }, [sp, resetDraft]);

  useEffect(() => {
    if (isOpen && (draft.categoryId || draft.condition)) {
      setAdvancedOpen(true);
    }
  }, [isOpen, draft.categoryId, draft.condition]);

  const showCategory =
    type === 'ads' || type === 'products' || type === 'services' || type === 'all';
  const showCondition = type === 'ads' || type === 'all';

  return (
    <div className="lg:hidden">
      <Button
        variant="outline"
        className="h-10 w-full justify-center gap-2 rounded-xl"
        onClick={handleOpen}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        تصفية
        {count > 0 && (
          <Badge
            size="sm"
            variant="default"
            className="min-w-5 justify-center px-1.5"
            aria-label={`${count} فلاتر نشطة`}
          >
            {count}
          </Badge>
        )}
      </Button>

      <Sheet open={isOpen} onOpenChange={(open) => (open ? handleOpen() : handleClose())}>
        <SheetContent className="flex max-h-[92dvh] flex-col p-0">
          <SheetHeader className="border-b border-border/60 px-4 pb-3 pt-1">
            <SheetTitle className="text-base font-bold">تصفية النتائج</SheetTitle>
            <p className="text-2xs text-muted-foreground sm:text-xs">
              المدينة والسعر أولاً — التغييرات تُطبَّق عند «عرض النتائج».
            </p>
          </SheetHeader>

          <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
            {/* Location = city only (no GPS) */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">المدينة</h3>
              <Select
                value={draft.city || 'ALL'}
                onValueChange={(v) => setCity(v === 'ALL' ? undefined : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="كل المدن" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">كل المدن</SelectItem>
                  {CITIES.map((city) => (
                    <SelectItem key={city} value={city}>
                      {city}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">السعر</h3>
              <div className="flex flex-wrap gap-1.5">
                {PRICE_PRESETS.map((p) => {
                  const isActive =
                    (p.min == null && p.max == null && draft.minPrice == null && draft.maxPrice == null) ||
                    (p.min === draft.minPrice && p.max === draft.maxPrice);
                  return (
                    <Button
                      key={p.label}
                      type="button"
                      size="sm"
                      variant={isActive ? 'secondary' : 'outline'}
                      className="rounded-full text-xs"
                      onClick={() => setPrice(p.min, p.max)}
                    >
                      {p.label}
                    </Button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <label htmlFor="nf-min-price" className="text-xs font-medium text-muted-foreground">
                    من
                  </label>
                  <Input
                    id="nf-min-price"
                    inputMode="numeric"
                    type="number"
                    min={0}
                    value={draft.minPrice ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPrice(v === '' ? undefined : Number(v), draft.maxPrice);
                    }}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="nf-max-price" className="text-xs font-medium text-muted-foreground">
                    إلى
                  </label>
                  <Input
                    id="nf-max-price"
                    inputMode="numeric"
                    type="number"
                    min={0}
                    value={draft.maxPrice ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPrice(draft.minPrice, v === '' ? undefined : Number(v));
                    }}
                    placeholder="بدون حد"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-1.5">
              <h3 className="text-sm font-semibold">الترتيب</h3>
              <Select
                value={draft.sort && draft.sort !== 'distance' ? draft.sort : 'relevance'}
                onValueChange={(v) => setSort(v === 'relevance' ? undefined : (v as SearchSort))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UI_SORT_OPTIONS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {SORT_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>

            {showCategory && (
              <section className="space-y-2">
                <button
                  type="button"
                  className="flex w-full items-center justify-between text-sm font-semibold"
                  onClick={() => setAdvancedOpen((o) => !o)}
                  aria-expanded={advancedOpen}
                >
                  خيارات أكثر
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', advancedOpen && 'rotate-180')}
                  />
                </button>
                {advancedOpen && (
                  <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">الفئة</label>
                      <Select
                        value={draft.categoryId || 'ALL'}
                        onValueChange={(v) => setCategoryId(v === 'ALL' ? undefined : v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="كل الفئات" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ALL">كل الفئات</SelectItem>
                          {(type === 'ads' || type === 'all') &&
                            adCategories?.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.nameAr}
                              </SelectItem>
                            ))}
                          {(type === 'products' || type === 'all') &&
                            productCategories?.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.nameAr}
                              </SelectItem>
                            ))}
                          {(type === 'services' || type === 'all') &&
                            serviceCategories?.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.nameAr}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {showCondition && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          حالة الإعلان
                        </label>
                        <Select
                          value={draft.condition || 'ALL'}
                          onValueChange={(v) =>
                            setCondition(v === 'ALL' ? undefined : (v as AdCondition))
                          }
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="كل الحالات" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ALL">كل الحالات</SelectItem>
                            {(Object.keys(CONDITION_LABELS) as AdCondition[]).map((c) => (
                              <SelectItem key={c} value={c}>
                                {CONDITION_LABELS[c] ?? c}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            <Button variant="outline" className="w-full text-sm" onClick={handleReset}>
              إعادة تعيين الفلاتر
            </Button>
          </div>

          <div className="sticky bottom-0 border-t border-border/60 bg-background/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
            <Button
              type="button"
              className="h-11 w-full rounded-xl font-semibold"
              onClick={handleApply}
            >
              عرض النتائج
              {count > 0 ? ` (${count})` : ''}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
