'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button }  from '@/components/shared/ui/Button';
import { Input }   from '@/components/shared/ui/Input';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
import { CITIES, CONDITION_LABELS, AD_SORT_OPTIONS, ROUTES } from '@/lib/constants';
import { useCategories, useCategoryBySlug } from '@/hooks/queries/useCategories';
import { SlidersHorizontal } from 'lucide-react';

// FIX P2-5: price inputs used to fire a navigation on onBlur — tabbing
// from "من" to "إلى" (a completely normal way to fill both fields)
// blurred the first field and fired a mid-entry search before the
// second was even touched. Debouncing on onChange instead (same
// setTimeout-based pattern useFormDraft.ts already uses) means one
// search fires ~500ms after the user stops typing in *either* field,
// not once per field per blur.
const PRICE_DEBOUNCE_MS = 500;

interface Props {
  /** Present when rendered from the category page — see SearchResults' categorySlug prop for context. */
  categorySlug?: string;
}

export function SearchFilters({ categorySlug }: Props = {}) {
  const router       = useRouter();
  const sp           = useSearchParams();
  // FIX BUG-06: update() and the "reset" button both hardcoded
  // ROUTES.search, so using this component from the category page
  // (app/(public)/categories/[slug]/page.tsx) silently redirected every
  // filter change — and the reset button — off the category page and
  // onto /search, dropping the category context entirely. Reading the
  // current path means filter changes stay on whichever page rendered
  // this component.
  const pathname     = usePathname();
  const { data: categories } = useCategories();
  const { data: activeCategory } = useCategoryBySlug(categorySlug ?? '');
  const activeCategoryId = sp.get('categoryId') ?? activeCategory?.id ?? '';

  // Controlled local state for the two price inputs, debounced before
  // touching the URL. Re-synced from the URL below so external resets
  // (the "إعادة تعيين الفلاتر" button, or the user editing the URL
  // directly) still clear these fields.
  const [minPrice, setMinPrice] = useState(sp.get('minPrice') ?? '');
  const [maxPrice, setMaxPrice] = useState(sp.get('maxPrice') ?? '');
  const priceDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setMinPrice(sp.get('minPrice') ?? '');
    setMaxPrice(sp.get('maxPrice') ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.get('minPrice'), sp.get('maxPrice')]);

  function updatePrice(key: 'minPrice' | 'maxPrice', value: string) {
    if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current);
    priceDebounceRef.current = setTimeout(() => update(key, value), PRICE_DEBOUNCE_MS);
  }

  useEffect(() => () => {
    if (priceDebounceRef.current) clearTimeout(priceDebounceRef.current);
  }, []);

  function update(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value); else params.delete(key);
    params.delete('page');
    router.push(`${pathname}?${params.toString()}`);
  }

  // FIX BUG-06 (cont.): picking a category from this dropdown while on
  // a category page should navigate to that category's own page (clean,
  // shareable /categories/:slug URL, consistent with how the user got
  // here) instead of piling a ?categoryId= param on top of the current
  // slug, which would leave the two disagreeing about which category is
  // actually active.
  function updateCategory(categoryId: string) {
    if (!categoryId) {
      router.push(categorySlug ? ROUTES.search : pathname);
      return;
    }
    const flat = (categories ?? []).flatMap((c) => [c, ...(c.children ?? [])]);
    const match = flat.find((c) => c.id === categoryId);
    if (match) router.push(ROUTES.category(match.slug));
    else update('categoryId', categoryId);
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
        <Select value={activeCategoryId || 'ALL'} onValueChange={(v) => updateCategory(v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-full"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">كل الفئات</SelectItem>
            {categories?.map((cat) => (
              <SelectGroup key={cat.id}>
                <SelectLabel>{cat.nameAr}</SelectLabel>
                <SelectItem value={cat.id}>{cat.nameAr}</SelectItem>
                {cat.children?.map((child) => (
                  <SelectItem key={child.id} value={child.id}>— {child.nameAr}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* City */}
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

      {/* Condition */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">الحالة</label>
        <Select value={sp.get('condition') || 'ALL'} onValueChange={(v) => update('condition', v === 'ALL' ? '' : v)}>
          <SelectTrigger className="w-full"><SelectValue placeholder="الكل" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">الكل</SelectItem>
            {Object.entries(CONDITION_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Price range */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">السعر (₪)</label>
        <div className="flex gap-2">
          <Input type="number" placeholder="من" min={0} dir="ltr"
            value={minPrice}
            onChange={(e) => { setMinPrice(e.target.value); updatePrice('minPrice', e.target.value); }}
            className="w-full" />
          <Input type="number" placeholder="إلى" min={0} dir="ltr"
            value={maxPrice}
            onChange={(e) => { setMaxPrice(e.target.value); updatePrice('maxPrice', e.target.value); }}
            className="w-full" />
        </div>
      </div>

      {/* Sort */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground font-medium uppercase tracking-wide">الترتيب</label>
        <Select
          value={`${sp.get('sortBy') ?? 'createdAt'}_${sp.get('sortOrder') ?? 'desc'}`}
          onValueChange={(value) => {
            const [sortBy = 'createdAt', sortOrder = 'desc'] = value.split('_');
            const params = new URLSearchParams(sp.toString());
            params.set('sortBy', sortBy); params.set('sortOrder', sortOrder);
            params.delete('page');
            router.push(`${pathname}?${params.toString()}`);
          }}
        >
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {AD_SORT_OPTIONS.map((o) => (
              <SelectItem key={`${o.sortBy}_${o.sortOrder}`} value={`${o.sortBy}_${o.sortOrder}`}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Reset */}
      {/* FIX BUG-06 (cont.): on /search this simply clears everything, but
          on a category page it must stay put — routing to plain
          ROUTES.search here would silently drop the category itself
          (the whole reason the user is on this page) instead of just
          clearing the extra filters layered on top of it. */}
      <Button variant="outline" className="w-full text-sm" onClick={() => router.push(pathname)}>
        إعادة تعيين الفلاتر
      </Button>
    </div>
  );
}
