'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/shared/ui/Input';
import { Button } from '@/components/shared/ui/Button';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
import { CITIES, ROUTES } from '@/lib/constants';
import { useCategories } from '@/hooks/queries/useCategories';
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { SearchNearbyToggle } from '@/components/search/SearchNearbyToggle';
import { cn } from '@/lib/utils';
import type { SearchType } from '@/types/search.types';

/**
 * Basic filters first (location + city) — the two users change most.
 * Category sits behind "خيارات أكثر" so the default sheet/panel stays
 * short on mobile; opens automatically when a category is already active.
 */
export function SearchFilters() {
  const router = useRouter();
  const sp = useSearchParams();

  const type = (sp.get('type') as SearchType) ?? 'all';
  const hasCategory = Boolean(sp.get('categoryId'));
  const [advancedOpen, setAdvancedOpen] = useState(hasCategory);

  const { data: adCategories } = useCategories();
  const { data: productCategories } = useProductCategories();
  const { data: serviceCategories } = useServiceCategories();

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    // SW-FILTERS-REPLACE-01: replace, not push. Filter changes are
    // refinements of the current search, not separate destinations —
    // pushing bloated the back stack with one entry per keystroke on
    // a Select, so the browser's back button had to be tapped N times
    // to leave the search page. Also matches how SearchNearbyToggle
    // and SearchTabsWrapper behave for the same class of navigation.
    router.replace(`${ROUTES.search}?${params.toString()}`);
  }

  const showCategoryFilter = type === 'ads' || type === 'products' || type === 'services';

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        تصفية النتائج
      </div>

      {/* —— Basic: المدينة أولوية (بدون GPS) —— */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          المدينة
        </label>
        <Select
          value={sp.get('city') || 'ALL'}
          onValueChange={(v) => update('city', v === 'ALL' ? '' : v)}
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

      {/* —— Advanced (category) —— */}
      {/* SW-NEARBY-WIRE-01: SearchNearbyToggle existed (95 lines) with
          its own test but was never imported anywhere in app/ or
          components/. The geolocation trigger rendered nothing, so no
          user could ever activate the lat/lng/radius URL contract that
          SearchResults already reads. Wired in here so it appears both
          in the desktop <aside> and inside SearchFiltersSheet on
          mobile — the two places this SearchFilters tree already
          renders — with no extra plumbing. */}
      <div className="border-t pt-3">
        <SearchNearbyToggle />
      </div>

      {showCategoryFilter && (
        <div className="border-t pt-3">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-sm font-medium text-foreground"
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
              className={cn('h-4 w-4 text-muted-foreground transition-transform', advancedOpen && 'rotate-180')}
              aria-hidden
            />
          </button>

          {advancedOpen && (
            <div className="mt-3 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                الفئة
              </label>
              <Select
                value={sp.get('categoryId') || 'ALL'}
                onValueChange={(v) => update('categoryId', v === 'ALL' ? '' : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="كل الفئات" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">كل الفئات</SelectItem>
                  {type === 'ads' &&
                    adCategories?.map((cat) => (
                      <SelectGroup key={cat.id}>
                        <SelectLabel>{cat.nameAr}</SelectLabel>
                        <SelectItem value={cat.id}>{cat.nameAr}</SelectItem>
                        {cat.children?.map((child) => (
                          <SelectItem key={child.id} value={child.id}>
                            — {child.nameAr}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  {type === 'products' &&
                    productCategories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.nameAr}
                      </SelectItem>
                    ))}
                  {type === 'services' &&
                    serviceCategories?.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.nameAr}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {true && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label htmlFor="search-min-price" className="text-xs font-medium text-muted-foreground">السعر من</label>
                    <Input id="search-min-price" inputMode="numeric" type="number" min={0} value={sp.get('minPrice') ?? ''} onChange={(e) => update('minPrice', e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="search-max-price" className="text-xs font-medium text-muted-foreground">السعر إلى</label>
                    <Input id="search-max-price" inputMode="numeric" type="number" min={0} value={sp.get('maxPrice') ?? ''} onChange={(e) => update('maxPrice', e.target.value)} placeholder="بدون حد" />
                  </div>
                </div>
              )}
              {type === 'ads' && (
                <div className="mt-3 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">حالة الإعلان</label>
                  <Select value={sp.get('condition') || 'ALL'} onValueChange={(v) => update('condition', v === 'ALL' ? '' : v)}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="كل الحالات" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">كل الحالات</SelectItem>
                      <SelectItem value="NEW">جديد</SelectItem>
                      <SelectItem value="USED">مستعمل</SelectItem>
                      <SelectItem value="REFURBISHED">مجدد</SelectItem>
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
          router.push(q ? `${ROUTES.search}?q=${encodeURIComponent(q)}` : ROUTES.search);
        }}
      >
        إعادة تعيين الفلاتر
      </Button>
    </div>
  );
}
