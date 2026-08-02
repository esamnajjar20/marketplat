'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
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
          <select
            value={sp.get('categoryId') ?? ''}
            onChange={(e) => update('categoryId', e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">كل الفئات</option>
            {type === 'ads' &&
              adCategories?.map((cat) => (
                <optgroup key={cat.id} label={cat.nameAr}>
                  <option value={cat.id}>{cat.nameAr}</option>
                  {cat.children?.map((child) => (
                    <option key={child.id} value={child.id}>
                      — {child.nameAr}
                    </option>
                  ))}
                </optgroup>
              ))}
            {type === 'products' &&
              productCategories?.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nameAr}
                </option>
              ))}
            {type === 'services' &&
              serviceCategories?.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nameAr}
                </option>
              ))}
          </select>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">المدينة</label>
        <select
          value={sp.get('city') ?? ''}
          onChange={(e) => update('city', e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">كل المدن</option>
          {CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">الترتيب</label>
        <select
          value={sp.get('sort') ?? 'relevance'}
          onChange={(e) => update('sort', e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
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
