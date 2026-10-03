'use client';

import { AdCard } from '@/components/ads/AdCard';
import { HomeScrollRail, HomeScrollRailItem } from '@/components/home/HomeScrollRail';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { ApiError } from '@/components/shared/ApiError';
import { useAdsForHome } from '@/hooks/queries/useAdsForHome';
import { useRecommendations } from '@/hooks/queries/useRecommendations';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';
import { useDataSaver } from '@/lib/useDataSaver';

/** Ads: city priority + personal interest + healthy freshness fallback. */
export function RecentAds() {
  const dataSaver = useDataSaver();
  const { city, isReady } = useBrowseCity();
  const isHydrated = useAuthStore(selectIsHydrated);
  const isAuth = useAuthStore(selectIsAuthenticated);
  const limit = dataSaver ? 6 : 8;
  const ready = isHydrated && isReady;

  const ranked = useRecommendations(
    { limit, ...(city ? { city } : {}) },
    { enabled: ready, scope: isAuth ? 'user' : 'guest' },
  );
  const fallback = useAdsForHome();

  const items = ranked.data?.length ? ranked.data : fallback.items.data;
  const loading = !ready || ranked.isLoading || (ranked.data?.length === 0 && fallback.isLoading);

  if (loading) {
    return (
      <HomeScrollRail>
        {Array.from({ length: 6 }).map((_, i) => (
          <HomeScrollRailItem key={i} size="wide"><AdCardSkeleton /></HomeScrollRailItem>
        ))}
      </HomeScrollRail>
    );
  }

  if (!items.length && ranked.isError && fallback.isError) {
    return <ApiError error={ranked.error} onRetry={() => { void ranked.refetch(); void fallback.refetch(); }} variant="inline" />;
  }

  return (
    <HomeScrollRail className="stagger-fade-in">
      {items.map((ad, i) => (
        <HomeScrollRailItem key={ad.id} size="wide">
          <AdCard ad={ad} context="public" priority={i < 2} density="compact" />
        </HomeScrollRailItem>
      ))}
    </HomeScrollRail>
  );
}
