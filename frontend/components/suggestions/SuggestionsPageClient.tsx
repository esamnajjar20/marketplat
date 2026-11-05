'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import { AdCard } from '@/components/ads/AdCard';
import { ProductCard } from '@/components/stores/ProductCard';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useMixedRecommendations } from '@/hooks/queries/useRecommendations';
import { useAds } from '@/hooks/queries/useAds';
import { useProducts } from '@/hooks/queries/useProducts';
import { useServiceListings } from '@/hooks/queries/useServiceListings';
import { buildForYouFeed } from '@/lib/forYouFeed';
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { ROUTES } from '@/lib/constants';
import { PageHeader } from '@/components/shared/layout/PageHeader';

const PAGE_LIMIT = 36;
const PER_TYPE = 16;

/**
 * Full-page "اقتراحات لك" — same logic as the home rail, higher limits, 2-col grid.
 */

export type SuggestionsMode = 'suggestions' | 'trending' | 'for-you';

export function SuggestionsPageClient({ mode = 'suggestions' }: { mode?: SuggestionsMode }) {
  const isAuth = useAuthStore(selectIsAuthenticated);
  const isHydrated = useAuthStore(selectIsHydrated);
  const { city, isReady } = useBrowseCity();

  const ready = isHydrated && isReady;
  const cityParam = city ? { city } : {};

  const wantsPersonalized = mode !== 'trending';
  const usePersonalized = isAuth && wantsPersonalized;

  // The mixed endpoint returns all three recommendation rails in one call.
  // This replaces three parallel recommendation requests for guests and
  // keeps the existing personalized scope for signed-in visitors.
  const mixedQ = useMixedRecommendations(
    { limit: PER_TYPE, ...cityParam },
    { enabled: ready, scope: usePersonalized ? 'user' : 'guest' },
  );

  const recAds = mixedQ.data?.ads ?? undefined;
  const recProducts = mixedQ.data?.products ?? undefined;
  const recServices = mixedQ.data?.services ?? undefined;

  const recommendationSettled = mixedQ.isSuccess || mixedQ.isError;
  const fallbackParams = {
    limit: PER_TYPE,
    sortBy: 'createdAt' as const,
    sortOrder: 'desc' as const,
    ...(city ? { city } : {}),
  };
  // Fetch a public recent-list fallback only for a type that the completed
  // recommendation response could not fill. Never issue all three fallback
  // requests speculatively while recommendations are still in flight.
  const fallbackAdsEnabled = ready && recommendationSettled && (recAds?.length ?? 0) < PER_TYPE;
  const fallbackProductsEnabled = ready && recommendationSettled && (recProducts?.length ?? 0) < PER_TYPE;
  const fallbackServicesEnabled = ready && recommendationSettled && (recServices?.length ?? 0) < PER_TYPE;

  const fallbackAds = useAds(fallbackParams, {
    enabled: fallbackAdsEnabled,
    disableOfflineCache: true,
  });
  const fallbackProducts = useProducts(fallbackParams, { enabled: fallbackProductsEnabled });
  const fallbackServices = useServiceListings(fallbackParams, { enabled: fallbackServicesEnabled });

  const recAdsFeed = Array.isArray(recAds) ? recAds : undefined;
  const recProductsFeed = Array.isArray(recProducts) ? recProducts : undefined;
  const recServicesFeed = Array.isArray(recServices) ? recServices : undefined;
  const fallbackAdItems = fallbackAds.data?.items;
  const fallbackProductItems = fallbackProducts.data?.items;
  const fallbackServiceItems = fallbackServices.data?.items;

  const items = useMemo(
    () =>
      buildForYouFeed(
        {
          ad: { ranked: recAdsFeed, fallback: fallbackAdItems },
          product: { ranked: recProductsFeed, fallback: fallbackProductItems },
          service: { ranked: recServicesFeed, fallback: fallbackServiceItems },
        },
        { limit: PAGE_LIMIT },
      ),
    [
      recAdsFeed,
      recProductsFeed,
      recServicesFeed,
      fallbackAdItems,
      fallbackProductItems,
      fallbackServiceItems,
    ],
  );

  const hasRecommendationContent = items.length > 0;
  const loading =
    ((!ready || mixedQ.isLoading) && !hasRecommendationContent) ||
    (fallbackAdsEnabled && fallbackAds.isLoading) ||
    (fallbackProductsEnabled && fallbackProducts.isLoading) ||
    (fallbackServicesEnabled && fallbackServices.isLoading);

  const [grace, setGrace] = useState(false);
  useEffect(() => {
    if (items.length === 0) return;
    const t = setTimeout(() => setGrace(true), 800);
    return () => clearTimeout(t);
  }, [items.length]);

  const showLoading = loading && items.length === 0 && !grace;

  return (
    <div className="container mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-4 sm:py-8">
      <PageHeader
        icon={<Sparkles className="h-6 w-6" />}
        eyebrow={mode === 'trending' ? 'رائج' : usePersonalized ? 'مخصّص لك' : 'رائج'}
        title={mode === 'trending' ? 'الرائج' : 'مخصّص لك'}
        description={mode === 'trending' ? 'المحتوى الأكثر رواجًا واكتشافًا الآن' : usePersonalized ? 'محتوى مختار حسب نشاطك واهتماماتك' : 'سجّل دخولك للحصول على اقتراحات مخصّصة لك'}
        actions={
          <Link href={ROUTES.home} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-medium text-primary shadow-xs hover:border-primary/30 hover:bg-primary-soft/40">
            الرئيسية
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
          </Link>
        }
      />

      {showLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <AdCardSkeleton key={i} density="compact" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-8 w-8" />}
          title="لا اقتراحات حالياً"
          description="ستظهر هنا اقتراحات عند توفر محتوى في السوق."
          action={
            <Link href={mode === 'trending' ? ROUTES.ads : '/login'} className="text-sm font-medium text-primary hover:underline">
              {mode === 'trending' ? 'تصفّح الإعلانات' : 'تسجيل الدخول'}
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <div key={`${item.kind}-${item.data.id}`} className="h-full">
              {item.kind === 'ad' ? (
                <AdCard ad={item.data} context="featured" density="compact" showKind />
              ) : item.kind === 'product' ? (
                <ProductCard product={item.data} context="featured" density="compact" showKind mixedList />
              ) : (
                <ServiceListingCard listing={item.data} context="featured" density="compact" showKind />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
