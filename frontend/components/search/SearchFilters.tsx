'use client';

/**
 * Desktop sidebar filters (lg+).
 * Applies changes immediately via router.replace (desktop expects instant feedback).
 * Shares parse/build helpers with NativeFilterSheet via lib/filterUrl.
 *
 * Replace the existing frontend/components/search/SearchFilters.tsx with this file.
 */

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/shared/ui/Input';
import { Button } from '@/components/shared/ui/Button';
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
import { PRICE_PRESETS } from '@/types/filter.types';
import { parseSearchParams, buildSearchHref } from '@/lib/filterUrl';

export function SearchFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const state = parseSearchParams(new URLSearchParams(sp.toString()));

  const type = (state.type ?? 'all') as SearchType;
  const hasCategory = Boolean(state.categoryId);
  const [advancedOpen, setAdvancedOpen] = useState(hasCategory);

  const { data: adCategories } = useCategories();
  const { data: productCategories } = useProductCategories();
  const { data: serviceCategories } = useServiceCategories();

  function apply(patch: Parameters<typeof buildSearchHref>[1]) {
    router.replace(buildSearchHref(new URLSearchParams(sp.toString()), patch));
  }

  const showCategoryFilter =
    type === 'ads' || type === 'products' || type === 'services' || type === 'all';

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        تصفية النتائج
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">المدينة</label>
        <Select
          value={state.city || 'ALL'}
          onValueChange={(v) =>
            apply(v === 'ALL' ? { city: undefined, clearKeys: ['city'] } : { city: v })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="كل المدن" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل المدن</SelectItem>
            {CITIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Price presets + inputs */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">السعر</label>
        <div className="flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((p) => {
            const isActive =
              (p.min == null &&
                p.max == null &&
                state.minPrice == null &&
                state.maxPrice == null) ||
              (p.min === state.minPrice && p.max === state.maxPrice);
            return (
              <Button
                key={p.label}
                type="button"
                size="sm"
                variant={isActive ? 'secondary' : 'outline'}
                className="rounded-full text-xs"
                onClick={() =>
                  apply({
                    minPrice: p.min,
                    maxPrice: p.max,
                    clearKeys:
                      p.min == null && p.max == null
                        ? ['minPrice', 'maxPrice']
                        : undefined,
                  })
                }
              >
                {p.label}
              </Button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <label htmlFor="desk-min-price" className="text-xs text-muted-foreground">
              من
            </label>
            <Input
              id="desk-min-price"
              inputMode="numeric"
              type="number"
              min={0}
              value={state.minPrice ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                apply({
                  minPrice: v === '' ? undefined : Number(v),
                  clearKeys: v === '' ? ['minPrice'] : undefined,
                });
              }}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="desk-max-price" className="text-xs text-muted-foreground">
              إلى
            </label>
            <Input
              id="desk-max-price"
              inputMode="numeric"
              type="number"
              min={0}
              value={state.maxPrice ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                apply({
                  maxPrice: v === '' ? undefined : Number(v),
                  clearKeys: v === '' ? ['maxPrice'] : undefined,
                });
              }}
              placeholder="بدون حد"
            />
          </div>
        </div>
      </div>

      {/* GPS-free: SearchNearbyToggle intentionally omitted */}

      {showCategoryFilter && (
        <div className="border-t pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-sm font-medium"
            onClick={() => setAdvancedOpen((o) => !o)}
            aria-expanded={advancedOpen}
          >
            <span className="flex items-center gap-2">
              خيارات أكثر
              {hasCategory && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-2xs-tight font-semibold text-primary">
                  مفعّل
                </span>
              )}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                advancedOpen && 'rotate-180',
              )}
              aria-hidden
            />
          </button>

          {advancedOpen && (
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">الفئة</label>
                <Select
                  value={state.categoryId || 'ALL'}
                  onValueChange={(v) =>
                    apply(
                      v === 'ALL'
                        ? { categoryId: undefined, clearKeys: ['categoryId'] }
                        : { categoryId: v },
                    )
                  }
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

              {(type === 'ads' || type === 'all') && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    حالة الإعلان
                  </label>
                  <Select
                    value={state.condition || 'ALL'}
                    onValueChange={(v) =>
                      apply(
                        v === 'ALL'
                          ? { condition: undefined, clearKeys: ['condition'] }
                          : { condition: v as 'NEW' | 'USED' | 'REFURBISHED' },
                      )
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="كل الحالات" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">كل الحالات</SelectItem>
                      {Object.entries(CONDITION_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Button
        variant="outline"
        className="w-full text-sm"
        onClick={() => {
          const q = sp.get('q');
          const typeParam = sp.get('type');
          const params = new URLSearchParams();
          if (q) params.set('q', q);
          if (typeParam && typeParam !== 'all') params.set('type', typeParam);
          const qs = params.toString();
          router.replace(qs ? `${ROUTES.search}?${qs}` : ROUTES.search);
        }}
      >
        إعادة تعيين الفلاتر
      </Button>
    </div>
  );
}
