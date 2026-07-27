'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button }  from '@/components/shared/ui/Button';
import { Input }   from '@/components/shared/ui/Input';
import { CITIES, CONDITION_LABELS, AD_SORT_OPTIONS, ROUTES } from '@/lib/constants';
import { useCategories } from '@/hooks/queries/useCategories';
import { SlidersHorizontal } from 'lucide-react';

export function SearchFilters() {
  const router       = useRouter();
  const sp           = useSearchParams();
  const { data: categories } = useCategories();

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value); else params.delete(key);
    params.delete('page');
    router.push(`${ROUTES.search}?${params.toString()}`);
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <SlidersHorizontal className="h-4 w-4" />
        تصفية النتائج
      </div>

      {/* Category */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">الفئة</label>
        <select value={sp.get('categoryId') ?? ''}
          onChange={(e) => update('categoryId', e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="">كل الفئات</option>
          {categories?.map((cat) => (
            <optgroup key={cat.id} label={cat.nameAr}>
              <option value={cat.id}>{cat.nameAr}</option>
              {cat.children?.map((child) => (
                <option key={child.id} value={child.id}>— {child.nameAr}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* City */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">المدينة</label>
        <select value={sp.get('city') ?? ''}
          onChange={(e) => update('city', e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="">كل المدن</option>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Condition */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">الحالة</label>
        <select value={sp.get('condition') ?? ''}
          onChange={(e) => update('condition', e.target.value)}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <option value="">الكل</option>
          {Object.entries(CONDITION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Price range */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">السعر (₪)</label>
        <div className="flex gap-2">
          <Input type="number" placeholder="من" min={0} dir="ltr"
            defaultValue={sp.get('minPrice') ?? ''}
            onBlur={(e) => update('minPrice', e.target.value)} className="w-full" />
          <Input type="number" placeholder="إلى" min={0} dir="ltr"
            defaultValue={sp.get('maxPrice') ?? ''}
            onBlur={(e) => update('maxPrice', e.target.value)} className="w-full" />
        </div>
      </div>

      {/* Sort */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">الترتيب</label>
        <select
          value={`${sp.get('sortBy') ?? 'createdAt'}_${sp.get('sortOrder') ?? 'desc'}`}
          onChange={(e) => {
            const [sortBy = 'createdAt', sortOrder = 'desc'] = e.target.value.split('_');
            const params = new URLSearchParams(sp.toString());
            params.set('sortBy', sortBy); params.set('sortOrder', sortOrder);
            params.delete('page');
            router.push(`${ROUTES.search}?${params.toString()}`);
          }}
          className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          {AD_SORT_OPTIONS.map((o) => (
            <option key={`${o.sortBy}_${o.sortOrder}`} value={`${o.sortBy}_${o.sortOrder}`}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Reset */}
      <Button variant="outline" className="w-full text-sm" onClick={() => router.push(ROUTES.search)}>
        إعادة تعيين الفلاتر
      </Button>
    </div>
  );
}
