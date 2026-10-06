'use client';

import { useRef, type KeyboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { FavoritesList } from '@/components/profile/FavoritesList';
import { EntityFavoritesList } from '@/components/profile/EntityFavoritesList';
import { ROUTES } from '@/lib/constants';

type FavoritesTabValue = 'ad' | 'product' | 'store' | 'service';

const TABS: { value: FavoritesTabValue; label: string }[] = [
  { value: 'ad', label: 'الإعلانات' },
  { value: 'product', label: 'المنتجات' },
  { value: 'store', label: 'المتاجر' },
  { value: 'service', label: 'الخدمات' },
];

/**
 * FEAT-FAVORITE-POLYMORPHIC PR3: the backend has no combined/mixed
 * response for GET /favorites (favorites.validation.ts's
 * getFavoritesSchema comment), so the page picks exactly one type at
 * a time via a URL-bound tab strip — same custom-button-group pattern
 * SearchTabs.tsx/SearchTabsWrapper.tsx already established (no shadcn
 * Tabs primitive in this project). Defaulting to 'ad' with no ?type=
 * param at all preserves the pre-PR3 favorites page exactly: same
 * URL, same default view, same FavoritesList component untouched.
 */
export function FavoritesTabs() {
  const router = useRouter();
  const sp = useSearchParams();
  const rawType = sp.get('type');
  const type: FavoritesTabValue = rawType === 'product' || rawType === 'store' || rawType === 'service' ? rawType : 'ad';

  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowLeft') next = index + 1;
    else if (event.key === 'ArrowRight') next = index - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    const bounded = (next + TABS.length) % TABS.length;
    const nextTab = TABS[bounded];
    if (!nextTab) return;
    handleChange(nextTab.value);
    refs.current[bounded]?.focus();
  }

  function handleChange(next: FavoritesTabValue) {
    const params = new URLSearchParams(sp.toString());
    if (next === 'ad') params.delete('type');
    else params.set('type', next);
    params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `${ROUTES.favorites}?${qs}` : ROUTES.favorites);
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="نوع المفضلة" className="flex gap-1 overflow-x-auto border-b scrollbar-none">
        {TABS.map((tab, index) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={type === tab.value}
            aria-controls={`favorites-panel-${tab.value}`}
            tabIndex={type === tab.value ? 0 : -1}
            ref={(el) => { refs.current[index] = el; }}
            onKeyDown={(event) => handleKeyDown(event, index)}
            onClick={() => handleChange(tab.value)}
            className={cn(
              'min-h-11 shrink-0 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors',
              type === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div id={`favorites-panel-${type}`} role="tabpanel" tabIndex={-1} aria-label={TABS.find((tab) => tab.value === type)?.label}>
        {type === 'ad' && <FavoritesList />}
        {type === 'product' && <EntityFavoritesList type="PRODUCT" />}
        {type === 'store' && <EntityFavoritesList type="STORE" />}
        {type === 'service' && <EntityFavoritesList type="SERVICE_LISTING" />}
      </div>
    </div>
  );
}
