'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Sparkles, AlertTriangle } from 'lucide-react';
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
import type { AdListItem } from '@/types/ad.types';
import type { ProductWithStore } from '@/types/product.types';
import type { ServiceListingWithProvider } from '@/types/service.types';

type MixedItem =
  | { kind: 'ad'; data: AdListItem }
  | { kind: 'product'; data: ProductWithStore }
  | { kind: 'service'; data: ServiceListingWithProvider };

/** Interleave: ad → product → service → repeat so the shelf feels mixed. */
export function interleaveMixed(
  ads: AdListItem[],
  products: ProductWithStore[],
  services: ServiceListingWithProvider[],
  limit: number,
): MixedItem[] {
  const queues: MixedItem[][] = [
    ads.map((data) => ({ kind: 'ad' as const, data })),
    products.map((data) => ({ kind: 'product' as const, data })),
    services.map((data) => ({ kind: 'service' as const, data })),
  ];
  const idx = [0, 0, 0];
  const out: MixedItem[] = [];
  const seen = new Set<string>();

  while (out.length < limit) {
    let placed = false;
    for (let q = 0; q < queues.length && out.length < limit; q += 1) {
      const queue = queues[q];
      let i = idx[q] ?? 0;
      while (i < (queue?.length ?? 0)) {
        const item = queue![i]!;
        i += 1;
        const key = `${item.kind}-${item.data.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
        placed = true;
        break;
      }
      idx[q] = i;
    }
    if (!placed) break;
  }
  return out;
}

/**
 * Merge recommendation arrays with organic fallbacks (recent lists).
 * Recommendations win order; fallbacks fill gaps so the rail is never sparse.
 */
function mergeWithFallback<T extends { id: string }>(
  preferred: T[] | null | undefined,
  fallback: T[] | null | undefined,
  limit: number,
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const list of [preferred ?? [], fallback ?? []]) {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

const HOME_TARGET = 12;
const PER_TYPE = 8;

/**
 * "مخصص لك" — right after paid featured on the homepage.
 *
 * - Signed-in: mixed personalized API
 * - Guest: trending recommendations (seeded by /home when available)
 * - Always backfills from recent ads/products/services so the rail
 *   never shows a single lonely card when the market has content.
 */
export function ForYouMixedSection() {
  const dataSaver = useDataSaver();
  const target = dataSaver ? 8 : HOME_TARGET;
  const isAuth = useAuthStore(selectIsAuthenticated);
  const isHydrated = useAuthStore(selectIsHydrated);
  const { city, isReady } = useBrowseCity();

  const ready = isHydrated && isReady;
  // Keep param object stable-ish: always pass limit so keys match /home seed
  // when city is absent (seed uses { limit: 3 } historically — we also
  // request a larger set and fill from organic lists).
  const cityParam = city ? { city } : {};

  const mixedQ = useMixedRecommendations(
    { limit: PER_TYPE, ...cityParam },
    { enabled: ready && isAuth, scope: 'user' },
  );

  // Guest: enable network even if /home seed missed (param mismatch / empty).
  const guestOpts = { enabled: ready && !isAuth, scope: 'guest' as const };
  const adsQ = useRecommendations({ limit: PER_TYPE, ...cityParam }, guestOpts);
  const productsQ = useProductRecommendations({ limit: PER_TYPE, ...cityParam }, guestOpts);
  const servicesQ = useServiceRecommendations({ limit: PER_TYPE, ...cityParam }, guestOpts);

  // Organic fallbacks — always on once ready (cheap lists; fill sparse recs).
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

  const ads = mergeWithFallback(
    Array.isArray(recAds) ? recAds : [],
    fallbackAds.data?.items,
    PER_TYPE,
  );
  const products = mergeWithFallback(
    Array.isArray(recProducts) ? recProducts : [],
    fallbackProducts.data?.items,
    PER_TYPE,
  );
  const services = mergeWithFallback(
    Array.isArray(recServices) ? recServices : [],
    fallbackServices.data?.items,
    PER_TYPE,
  );

  const items = useMemo(
    () => interleaveMixed(ads, products, services, target),
    [ads, products, services, target],
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
            <HomeScrollRailItem key={i}>
              <AdCardSkeleton />
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
            <HomeScrollRailItem
              key={`${item.kind}-${item.data.id}`}
              size={item.kind === 'ad' ? 'wide' : 'default'}
            >
              {item.kind === 'ad' ? (
                <AdCard ad={item.data} density="compact" />
              ) : item.kind === 'product' ? (
                <ProductCard product={item.data} density="compact" />
              ) : (
                <ServiceListingCard listing={item.data} density="compact" />
              )}
            </HomeScrollRailItem>
          ))}
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
