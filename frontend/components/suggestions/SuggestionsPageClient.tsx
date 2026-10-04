'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkles, ArrowRight } from 'lucide-react';
import { AdCard } from '@/components/ads/AdCard';
import { ProductCard } from '@/components/stores/ProductCard';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import {
  useRecommendations,
  useProductRecommendations,
  useServiceRecommendations,
  useMixedRecommendations,
} from '@/hooks/queries/useRecommendations';
import { useAds } from '@/hooks/queries/useAds';
import { useProducts } from '@/hooks/queries/useProducts';
import { useServiceListings } from '@/hooks/queries/useServiceListings';
import { buildForYouFeed } from '@/lib/forYouFeed';
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { ROUTES } from '@/lib/constants';

const PAGE_LIMIT = 36;
const PER_TYPE = 16;

/**
 * Full-page "اقتراحات لك" — same logic as the home rail, higher limits, 2-col grid.
 */

export function SuggestionsPageClient() {
  const isAuth = useAuthStore(selectIsAuthenticated);
  const isHydrated = useAuthStore(selectIsHydrated);
  const { city, isReady } = useBrowseCity();

  const ready = isHydrated && isReady;
  const cityParam = city ? { city } : {};

  const mixedQ = useMixedRecommendations(
    { limit: PER_TYPE, ...cityParam },
    { enabled: ready && isAuth, scope: 'user' },
  );
  const guestOpts = { enabled: ready && !isAuth, scope: 'guest' as const };
  const adsQ = useRecommendations({ limit: PER_TYPE, ...cityParam }, guestOpts);
  const productsQ = useProductRecommendations({ limit: PER_TYPE, ...cityParam }, guestOpts);
  const servicesQ = useServiceRecommendations({ limit: PER_TYPE, ...cityParam }, guestOpts);

  const fallbackAds = useAds(
    { limit: PER_TYPE, sortBy: 'createdAt', sortOrder: 'desc', ...(city ? { city } : {}) },
    { enabled: ready, disableOfflineCache: true },
  );
  const fallbackProducts = useProducts(
    { limit: PER_TYPE, sortBy: 'createdAt', sortOrder: 'desc', ...(city ? { city } : {}) },
    { enabled: ready },
  );
  const fallbackServices = useServiceListings(
    { limit: PER_TYPE, sortBy: 'createdAt', sortOrder: 'desc', ...(city ? { city } : {}) },
    { enabled: ready },
  );

  const recAds = isAuth ? mixedQ.data?.ads : adsQ.data;
  const recProducts = isAuth ? mixedQ.data?.products : productsQ.data;
  const recServices = isAuth ? mixedQ.data?.services : servicesQ.data;

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

  const loading =
    !ready ||
    (isAuth ? mixedQ.isLoading : adsQ.isLoading || productsQ.isLoading || servicesQ.isLoading) ||
    (items.length === 0 &&
      (fallbackAds.isLoading || fallbackProducts.isLoading || fallbackServices.isLoading));

  const [grace, setGrace] = useState(false);
  useEffect(() => {
    if (items.length === 0) return;
    const t = setTimeout(() => setGrace(true), 800);
    return () => clearTimeout(t);
  }, [items.length]);

  const showLoading = loading && items.length === 0 && !grace;

  return (
    <div className="container mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-4 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {isAuth ? 'مخصّص' : 'رائج'}
          </p>
          <h1 className="text-xl font-bold sm:text-2xl">اقتراحات لك</h1>
          <p className="text-sm text-muted-foreground">
            {isAuth
              ? 'محتوى مختار حسب نشاطك واهتماماتك'
              : 'اتجاهات رائجة — سجّل دخولك لاقتراحات أدق'}
          </p>
        </div>
        <Link
          href={ROUTES.home}
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          الرئيسية
          <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
        </Link>
      </header>

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
            <Link href={ROUTES.ads} className="text-sm font-medium text-primary hover:underline">
              تصفّح الإعلانات
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
