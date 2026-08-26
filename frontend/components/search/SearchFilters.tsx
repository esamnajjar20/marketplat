'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
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
    router.push(`${ROUTES.search}?${params.toString()}`);
  }

  const showCategoryFilter = type === 'ads' || type === 'products' || type === 'services';

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        تصفية النتائج
      </div>

      {/* —— Basic —— */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          الموقع
        </label>
        <SearchNearbyToggle />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
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
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
