'use client';

/**
 * Horizontal quick-filter chips above search results.
 * GPS-free: no "nearby" / geolocation presets.
 */

import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { SearchType } from '@/types/search.types';
import {
  QUICK_FILTER_PRESETS,
  type QuickFilterPreset,
} from '@/types/filter.types';
import { parseSearchParams } from '@/lib/filterUrl';
import { hapticQuickFilter } from '@/lib/capacitor/nativeHaptics';

function isPresetActive(
  preset: QuickFilterPreset,
  current: ReturnType<typeof parseSearchParams>,
): boolean {
  const a = preset.apply;
  if (a.maxPrice != null) return current.maxPrice === a.maxPrice;
  if (a.minPrice != null) return current.minPrice === a.minPrice;
  if (a.condition) return current.condition === a.condition;
  if (a.sort) return current.sort === a.sort;
  return false;
}

export function QuickFiltersBar() {
  const router = useRouter();
  const sp = useSearchParams();
  const current = parseSearchParams(new URLSearchParams(sp.toString()));
  const type = (current.type ?? 'all') as SearchType;

  const applyPreset = useCallback(
    (preset: QuickFilterPreset) => {
      const params = new URLSearchParams(sp.toString());
      params.delete('page');
      // Never touch lat/lng/radius (GPS-free)
      const a = preset.apply;
      if (a.maxPrice != null) {
        if (current.maxPrice === a.maxPrice) params.delete('maxPrice');
        else params.set('maxPrice', String(a.maxPrice));
      }
      if (a.minPrice != null) {
        if (current.minPrice === a.minPrice) params.delete('minPrice');
        else params.set('minPrice', String(a.minPrice));
      }
      if (a.condition) {
        if (current.condition === a.condition) params.delete('condition');
        else params.set('condition', a.condition);
      }
      if (a.sort) {
        if (current.sort === a.sort) params.delete('sort');
        else params.set('sort', a.sort);
      }

      void hapticQuickFilter();
      const q = params.toString();
      router.replace(q ? `${ROUTES.search}?${q}` : ROUTES.search);
    },
    [sp, current, router],
  );

  const visible = QUICK_FILTER_PRESETS.filter(
    (p) => !p.types || p.types.includes(type),
  );

  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1"
      role="toolbar"
      aria-label="فلاتر سريعة"
    >
      {visible.map((preset) => {
        const active = isPresetActive(preset, current);
        return (
          <Button
            key={preset.id}
            type="button"
            size="sm"
            variant={active ? 'secondary' : 'outline'}
            className={cn(
              'shrink-0 rounded-full text-xs font-medium',
              active && 'ring-1 ring-primary/30',
            )}
            onClick={() => applyPreset(preset)}
          >
            {preset.label}
          </Button>
        );
      })}
    </div>
  );
}
