'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
import { CITIES, ROUTES } from '@/lib/constants';
import { useCategories } from '@/hooks/queries/useCategories';
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import type { SearchType } from '@/types/search.types';

const SORT_LABELS: Record<string, string> = {
  relevance: 'الأكثر تطابقاً',
  rating: 'الأعلى تقييماً',
  newest: 'الأحدث',
  views: 'الأكثر مشاهدة',
};

/**
 * City / category / sort filters for the unified search page. Follows
 * ads/SearchFilters.tsx's same "read from URL, push a new URL on
 * change" pattern (update()), but categoryId's option list depends on
 * `type` — each entity has its own category taxonomy (see
 * search.repository.ts's header: Ad/Product/ServiceListing categories
 * are three separate tables, StoreDetails has none at all) so there is
 * no single combined tree to show. When type is "all" or "stores",
 * the category filter is hidden entirely rather than showing a
 * misleading/partial list.
 *
 * Ad categories (useCategories) are a parent/children TREE
 * (types/category.types.ts's Category.children); product and service
 * categories (useProductCategories/useServiceCategories) are FLAT
 * lists (ProductCategory/ServiceCategory have no children field) — two
 * genuinely different shapes, rendered with two different option-list
 * branches below rather than forced into one shared loop.
 */
export function SearchFilters() {
  const router = useRouter();
  const sp = useSearchParams();

  const type = (sp.get('type') as SearchType) ?? 'all';

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
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <SlidersHorizontal className="h-4 w-4" />
        تصفية النتائج
      </div>

      {showCategoryFilter && (
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">الفئة</label>
          <Select value={sp.get('categoryId') || 'ALL'} onValueChange={(v) => update('categoryId', v === 'ALL' ? '' : v)}>
            <SelectTrigger className="w-full"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">كل الفئات</SelectItem>
              {type === 'ads' &&
                adCategories?.map((cat) => (
                  <SelectGroup key={cat.id}>
                    <SelectLabel>{cat.nameAr}</SelectLabel>
                    <SelectItem value={cat.id}>{cat.nameAr}</SelectItem>
                    {cat.children?.map((child) => (
                      <SelectItem key={child.id} value={child.id}>— {child.nameAr}</SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              {type === 'products' &&
                productCategories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.nameAr}</SelectItem>
                ))}
              {type === 'services' &&
                serviceCategories?.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.nameAr}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">المدينة</label>
        <Select value={sp.get('city') || 'ALL'} onValueChange={(v) => update('city', v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-full"><SelectValue placeholder="كل المدن" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل المدن</SelectItem>
            {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">الترتيب</label>
        <Select value={sp.get('sort') ?? 'relevance'} onValueChange={(v) => update('sort', v)}>
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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
