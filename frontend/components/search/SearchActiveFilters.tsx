'use client';

/**
 * Active filter chips — improved labels (sort, condition) + shared URL helpers.
 * Replace frontend/components/search/SearchActiveFilters.tsx
 */

import { X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import {
  FILTER_LABELS,
  CONDITION_LABELS,
  SORT_LABELS,
} from '@/types/filter.types';
import type { AdCondition } from '@/types/filter.types';
import type { SearchSort } from '@/types/search.types';
import { buildSearchHref, parseSearchParams } from '@/lib/filterUrl';

function labelFor(key: string, value: string): string {
  if (key === 'condition') {
    return `${FILTER_LABELS.condition}: ${CONDITION_LABELS[value as AdCondition] ?? value}`;
  }
  if (key === 'sort') {
    return `${FILTER_LABELS.sort}: ${SORT_LABELS[value as SearchSort] ?? value}`;
  }
  if (key === 'minPrice') return `من ${value} ₪`;
  if (key === 'maxPrice') return `إلى ${value} ₪`;
  return `${FILTER_LABELS[key] ?? key}: ${value}`;
}

export function SearchActiveFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const state = parseSearchParams(new URLSearchParams(sp.toString()));

  const chips: { key: string; value: string }[] = [];
  if (state.city) chips.push({ key: 'city', value: state.city });
  if (state.categoryId) chips.push({ key: 'categoryId', value: state.categoryId });
  if (state.minPrice != null) chips.push({ key: 'minPrice', value: String(state.minPrice) });
  if (state.maxPrice != null) chips.push({ key: 'maxPrice', value: String(state.maxPrice) });
  if (state.condition) chips.push({ key: 'condition', value: state.condition });
  if (state.sort && state.sort !== 'relevance') {
    chips.push({ key: 'sort', value: state.sort });
  }
  // GPS-free: do not surface lat/lng chips even if present in a shared URL
  const hasLocation = false;

  if (!chips.length && !hasLocation) return null;

  function clear(key: string) {
    router.replace(
      buildSearchHref(new URLSearchParams(sp.toString()), {
        clearKeys: [key],
        [key]: undefined,
      }),
    );
  }

  function clearLocation() {
    router.replace(
      buildSearchHref(new URLSearchParams(sp.toString()), {
        clearKeys: ['lat', 'lng', 'radius'],
        lat: undefined,
        lng: undefined,
        radius: undefined,
      }),
    );
  }

  function clearAll() {
    const params = new URLSearchParams();
    const q = sp.get('q');
    const type = sp.get('type');
    if (q) params.set('q', q);
    if (type && type !== 'all') params.set('type', type);
    router.replace(
      params.toString() ? `${ROUTES.search}?${params.toString()}` : ROUTES.search,
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="الفلاتر النشطة">
      <span className="text-xs font-medium text-muted-foreground">محدداتك:</span>
      {chips.map(({ key, value }) => (
        <Badge
          key={key}
          variant="outline"
          className="min-h-8 gap-1 rounded-full bg-muted/60 px-2.5 text-xs font-medium"
        >
          {labelFor(key, value)}
          <button
            type="button"
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => clear(key)}
            aria-label={`إزالة ${FILTER_LABELS[key] ?? key}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </Badge>
      ))}
      {hasLocation && (
        <Badge
          variant="outline"
          className="min-h-8 gap-1 rounded-full bg-muted/60 px-2.5 text-xs font-medium"
        >
          قريب مني
          {state.radius != null ? ` (${state.radius} كم)` : ''}
          <button
            type="button"
            className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={clearLocation}
            aria-label="إزالة الموقع"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </Badge>
      )}
      <Button
        type="button"
        variant="ghost"
        className="h-8 rounded-full px-2.5 text-xs text-muted-foreground hover:bg-muted"
        onClick={clearAll}
      >
        مسح الكل
      </Button>
    </div>
  );
}
