'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkles, AlertTriangle, ChevronLeft } from 'lucide-react';
import { AdCard } from '@/components/ads/AdCard';
import { ProductCard } from '@/components/stores/ProductCard';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { HomeScrollRail, HomeScrollRailItem } from '@/components/home/HomeScrollRail';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import {
  useRecommendations,
  useProductRecommendations,
  useServiceRecommendations,
  useMixedRecommendations,
} from '@/hooks/queries/useRecommendations';
import { useAds } from '@/hooks/queries/useAds';
import { useProducts } from '@/hooks/queries/useProducts';
import { useServiceListings } from '@/hooks/queries/useServiceListings';
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { useDataSaver } from '@/lib/useDataSaver';
import { ROUTES } from '@/lib/constants';
import { buildForYouFeed } from '@/lib/forYouFeed';

/** Cards shown / candidates fetched per type. Backend caps `limit` at 24 per type. */
const HOME_TARGET = 24;
const HOME_TARGET_SAVER = 12;
const PER_TYPE = 12;
const PER_TYPE_SAVER = 6;

/**
 * "مخصص لك" — right after paid featured on the homepage.
 *
 * - Signed-in: mixed personalized API
 * - Guest: trending recommendations (seeded by /home when available)
 * - Cards are ordered by the server's interest ranking, mixed across
 *   ads / products / services (see lib/forYouFeed.ts for the rules).
 * - Organic "recent" lists are fetched ONLY for a type whose ranked list
 *   came back short, and are placed after every ranked card.
 */

export function ForYouMixedSection() {
  const dataSaver = useDataSaver();
  const target = dataSaver ? HOME_TARGET_SAVER : HOME_TARGET;
  const perType = dataSaver ? PER_TYPE_SAVER : PER_TYPE;
  const isAuth = useAuthStore(selectIsAuthenticated);
  const isHydrated = useAuthStore(selectIsHydrated);
  const { city, isReady } = useBrowseCity();

  const ready = isHydrated && isReady;
  const cityParam = city ? { city } : {};

  const mixedQ = useMixedRecommendations(
    { limit: perType, ...cityParam },
    { enabled: ready && isAuth, scope: 'user' },
  );

  // Guest: enable network even if /home seed missed (param mismatch / empty).
  const guestOpts = { enabled: ready && !isAuth, scope: 'guest' as const };
  const adsQ = useRecommendations({ limit: perType, ...cityParam }, guestOpts);
  const productsQ = useProductRecommendations({ limit: perType, ...cityParam }, guestOpts);
  const servicesQ = useServiceRecommendations({ limit: perType, ...cityParam }, guestOpts);

  const recAds = isAuth ? mixedQ.data?.ads : adsQ.data;
  const recProducts = isAuth ? mixedQ.data?.products : productsQ.data;
  const recServices = isAuth ? mixedQ.data?.services : servicesQ.data;

  const recAdsLoading = isAuth ? mixedQ.isLoading : adsQ.isLoading;
  const recProductsLoading = isAuth ? mixedQ.isLoading : productsQ.isLoading;
  const recServicesLoading = isAuth ? mixedQ.isLoading : servicesQ.isLoading;

  const countOf = (list: unknown) => (Array.isArray(list) ? list.length : 0);

  // Organic fallbacks: only for a type whose ranked list is short (or failed),
  // and only once its ranked request has settled — so the common case costs
  // zero extra requests. Fallback cards always sort after ranked ones.
  const fallbackAds = useAds(
    { limit: perType, sortBy: 'createdAt', sortOrder: 'desc', ...(city ? { city } : {}) },
    { enabled: ready && !recAdsLoading && countOf(recAds) < perType, disableOfflineCache: true },
  );
  const fallbackProducts = useProducts(
    { limit: perType, sortBy: 'createdAt', sortOrder: 'desc', ...(city ? { city } : {}) },
    { enabled: ready && !recProductsLoading && countOf(recProducts) < perType },
  );
  const fallbackServices = useServiceListings(
    { limit: perType, sortBy: 'createdAt', sortOrder: 'desc', ...(city ? { city } : {}) },
    { enabled: ready && !recServicesLoading && countOf(recServices) < perType },
  );

  const fallbackAdItems = fallbackAds.data?.items;
  const fallbackProductItems = fallbackProducts.data?.items;
  const fallbackServiceItems = fallbackServices.data?.items;

  const items = useMemo(
    () =>
      buildForYouFeed(
        {
          ad: { ranked: recAds, fallback: fallbackAdItems },
          product: { ranked: recProducts, fallback: fallbackProductItems },
          service: { ranked: recServices, fallback: fallbackServiceItems },
        },
        { limit: target },
      ),
    [
      recAds,
      recProducts,
      recServices,
      fallbackAdItems,
      fallbackProductItems,
      fallbackServiceItems,
      target,
    ],
  );

  const recLoading = isAuth
    ? mixedQ.isLoading
    : adsQ.isLoading || productsQ.isLoading || servicesQ.isLoading;
  const fallbackLoading =
    fallbackAds.isLoading || fallbackProducts.isLoading || fallbackServices.isLoading;
  const anyRecData = Boolean(
    (Array.isArray(recAds) && recAds.length) ||
      (Array.isArray(recProducts) && recProducts.length) ||
      (Array.isArray(recServices) && recServices.length),
  );
  const anyFallbackData = Boolean(
    fallbackAds.data?.items?.length ||
      fallbackProducts.data?.items?.length ||
      fallbackServices.data?.items?.length,
  );

  const [graceExpired, setGraceExpired] = useState(false);
  const waitingPartial = ready && (recLoading || fallbackLoading) && (anyRecData || anyFallbackData);
  useEffect(() => {
    if (!waitingPartial) {
      setGraceExpired(false);
      return;
    }
    const t = setTimeout(() => setGraceExpired(true), 1200);
    return () => clearTimeout(t);
  }, [waitingPartial]);

  const showLoading =
    !ready ||
    ((recLoading || fallbackLoading) && !anyRecData && !anyFallbackData) ||
    (waitingPartial && !graceExpired && items.length < 2);

  const allError =
    ready &&
    !recLoading &&
    !fallbackLoading &&
    items.length === 0 &&
    (isAuth ? mixedQ.isError : adsQ.isError && productsQ.isError && servicesQ.isError) &&
    fallbackAds.isError &&
    fallbackProducts.isError &&
    fallbackServices.isError;

  // Hide section entirely when truly empty (no empty-state noise on home).
  if (!showLoading && !allError && items.length === 0) {
    return null;
  }

  return (
    <section className="container mx-auto max-w-7xl space-y-3 px-3 py-2 sm:space-y-4 sm:px-4 sm:py-3">
      <SectionHeader
        tone="featured"
        eyebrow={isAuth ? 'لك' : 'رائج'}
        title="مخصص لك"
        icon={<Sparkles className="h-3.5 w-3.5" />}
        cta={{ href: ROUTES.suggestions, label: 'عرض الكل ←' }}
      />

      {showLoading ? (
        <HomeScrollRail>
          {Array.from({ length: 4 }).map((_, i) => (
            <HomeScrollRailItem key={i} size="wide">
              <AdCardSkeleton density="compact" />
            </HomeScrollRailItem>
          ))}
        </HomeScrollRail>
      ) : allError ? (
        <div className="flex flex-col items-center gap-2 py-6 text-sm">
          <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
          <p className="text-destructive">تعذّر تحميل الاقتراحات</p>
          <button
            type="button"
            onClick={() => {
              if (isAuth) void mixedQ.refetch();
              else {
                void adsQ.refetch();
                void productsQ.refetch();
                void servicesQ.refetch();
              }
              void fallbackAds.refetch();
              void fallbackProducts.refetch();
              void fallbackServices.refetch();
            }}
            className="text-primary hover:underline"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <HomeScrollRail className="stagger-fade-in">
          {items.map((item) => (
            // One width for every type: a rail mixing 180px and 220px cards
            // looked jagged and cut product/service titles shorter than ads.
            <HomeScrollRailItem key={`${item.kind}-${item.data.id}`} size="wide">
              {item.kind === 'ad' ? (
                <AdCard ad={item.data} context="featured" density="compact" showKind />
              ) : item.kind === 'product' ? (
                <ProductCard product={item.data} context="featured" density="compact" showKind />
              ) : (
                <ServiceListingCard listing={item.data} context="featured" density="compact" showKind />
              )}
            </HomeScrollRailItem>
          ))}
          <HomeScrollRailItem>
            <Link
              href={ROUTES.suggestions}
              prefetch={false}
              className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/80 p-4 text-center text-sm font-semibold text-primary transition-colors hover:border-primary/40 hover:bg-card active:scale-[0.98]"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </span>
              عرض المزيد
            </Link>
          </HomeScrollRailItem>
        </HomeScrollRail>
      )}

      {!isAuth && items.length > 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          <Link href={ROUTES.login} prefetch={false} className="text-primary hover:underline">
            سجّل دخولك
          </Link>
          {' '}لتخصيص الاقتراحات حسب اهتماماتك
        </p>
      ) : null}
    </section>
  );
}
