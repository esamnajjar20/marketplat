'use client';

import dynamic from 'next/dynamic';
import { TabsBar } from '@/components/shared/ui/TabsBar';
import { ROUTES } from '@/lib/constants';
import { useUnifiedFilters } from '@/hooks/useUnifiedFilters';
import { parseFilterEnum } from '../../../shared/filters';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';

const FavoritesList = dynamic(
  () => import('@/components/profile/FavoritesList').then((module) => module.FavoritesList),
  { loading: () => <SuspenseFallback /> },
);
const EntityFavoritesList = dynamic(
  () => import('@/components/profile/EntityFavoritesList').then((m) => m.EntityFavoritesList),
  { loading: () => <SuspenseFallback /> },
);

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
 * a time via a URL-bound tab strip backed by the shared TabsBar.
 * Defaulting to 'ad' with no ?type=
 * param at all preserves the pre-PR3 favorites page exactly: same
 * URL, same default view, same FavoritesList component untouched.
 */
export function FavoritesTabs() {
  const filters = useUnifiedFilters({ basePath: ROUTES.favorites, profile: 'favorites', mode: 'replace' });
  const type: FavoritesTabValue = parseFilterEnum(filters.get('type'), ['product', 'store', 'service'] as const) ?? 'ad';

  function handleChange(next: FavoritesTabValue) {
    filters.update('type', next === 'ad' ? null : next, { mode: 'replace' });
  }

  return (
    <div className="space-y-4">
      <TabsBar
        value={type}
        onChange={handleChange}
        options={TABS.map((tab) => ({ ...tab, panelId: `favorites-panel-${tab.value}` }))}
        ariaLabel="نوع المفضلة"
        variant="underline"
        idPrefix="favorites-type"
      />

      <div id={`favorites-panel-${type}`} role="tabpanel" tabIndex={-1} aria-label={TABS.find((tab) => tab.value === type)?.label}>
        {type === 'ad' && <FavoritesList />}
        {type === 'product' && <EntityFavoritesList type="PRODUCT" />}
        {type === 'store' && <EntityFavoritesList type="STORE" />}
        {type === 'service' && <EntityFavoritesList type="SERVICE_LISTING" />}
      </div>
    </div>
  );
}
