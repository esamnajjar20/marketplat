'use client';

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
  const type = (sp.get('type') as FavoritesTabValue) ?? 'ad';

  function handleChange(next: FavoritesTabValue) {
    const params = new URLSearchParams(sp.toString());
    if (next === 'ad') params.delete('type');
    else params.set('type', next);
    params.delete('page');
    const qs = params.toString();
    router.push(qs ? `${ROUTES.favorites}?${qs}` : ROUTES.favorites);
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="نوع المفضلة" className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={type === tab.value}
            onClick={() => handleChange(tab.value)}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              type === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {type === 'ad' && <FavoritesList />}
      {type === 'product' && <EntityFavoritesList type="PRODUCT" />}
      {type === 'store' && <EntityFavoritesList type="STORE" />}
      {type === 'service' && <EntityFavoritesList type="SERVICE_LISTING" />}
    </div>
  );
}
