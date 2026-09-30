'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { AdCard } from '@/components/ads/AdCard';
import { ProductCard } from '@/components/stores/ProductCard';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { HomeScrollRail, HomeScrollRailItem } from '@/components/home/HomeScrollRail';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import {
  useRecommendations,
  useProductRecommendations,
  useServiceRecommendations,
  useMixedRecommendations,
} from '@/hooks/queries/useRecommendations';
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { homeSectionLimit } from '@/lib/listLimits';
import { useDataSaver } from '@/lib/useDataSaver';
import { ROUTES } from '@/lib/constants';
import type { AdListItem } from '@/types/ad.types';
import type { ProductWithStore } from '@/types/product.types';
import type { ServiceListingWithProvider } from '@/types/service.types';

type MixedItem =
  | { kind: 'ad'; data: AdListItem }
  | { kind: 'product'; data: ProductWithStore }
  | { kind: 'service'; data: ServiceListingWithProvider };

/**
 * Interleave ads / products / services so the shelf feels mixed rather
 * than three stacked blocks. Pattern: ad, product, service, repeat.
 */
function interleaveMixed(
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

  while (out.length < limit) {
    let placed = false;

    for (let q = 0; q < queues.length && out.length < limit; q += 1) {
      const queue = queues[q];
      const i = idx[q] ?? 0;
      const item = queue?.[i];

      if (item !== undefined) {
        out.push(item);
        idx[q] = i + 1;
        placed = true;
      }
    }

    if (!placed) break;
  }

  return out;
}

/**
 * "مخصص لك" — personalized when logged in (backend uses auth token),
 * trending fallback for guests. Mixes ads + products + services.
 */
export function ForYouMixedSection() {
  const dataSaver = useDataSaver();
  const limit = homeSectionLimit(9, 6, dataSaver);
  const perType = Math.max(3, Math.ceil(limit / 3));
  const isAuth = useAuthStore(selectIsAuthenticated);
  const isHydrated = useAuthStore(selectIsHydrated);
  const { city, isReady } = useBrowseCity();

  // Wait until auth + browse city are resolved: firing earlier sends the
  // request as a guest (and without the city), then repeats it once auth
  // resolves — wasted requests, and a title that flips after hydration.
  const ready = isHydrated && isReady;
  const cityParam = city ? { city } : {};

  // RECS-MIXED-01: a signed-in visitor's personalized shelf is ONE request
  // (type=mixed) instead of three. A guest's shelf is already seeded into
  // the three per-type keys by GET /home (see useHomepage), so those hooks
  // stay in charge for guests and normally never hit the network. Each
  // side is disabled for the other audience.
  const mixedQ = useMixedRecommendations(
    { limit: perType, ...cityParam },
    { enabled: ready && isAuth, scope: 'user' },
  );
  const guestOpts = { enabled: ready && !isAuth, scope: 'guest' } as const;
  const adsQ = useRecommendations({ limit: perType, ...cityParam }, guestOpts);
  const productsQ = useProductRecommendations({ limit: perType, ...cityParam }, guestOpts);
  const servicesQ = useServiceRecommendations({ limit: perType, ...cityParam }, guestOpts);

  const adsData = isAuth ? mixedQ.data?.ads : adsQ.data;
  const productsData = isAuth ? mixedQ.data?.products : productsQ.data;
  const servicesData = isAuth ? mixedQ.data?.services : servicesQ.data;

  const enabled = ready;
  const anyLoading = isAuth
    ? mixedQ.isLoading
    : adsQ.isLoading || productsQ.isLoading || servicesQ.isLoading;
  const anyData = Boolean(adsData?.length || productsData?.length || servicesData?.length);

  // The three requests are independent: if one is slow but another already
  // returned items, stop showing skeletons after a short grace period instead
  // of waiting for the slowest. (Waiting briefly first avoids the shelf
  // reshuffling as each type arrives.)
  const [graceExpired, setGraceExpired] = useState(false);
  const waitingOnSlowOne = enabled && anyLoading && anyData;
  useEffect(() => {
    if (!waitingOnSlowOne) return;
    const t = setTimeout(() => setGraceExpired(true), 1500);
    return () => clearTimeout(t);
  }, [waitingOnSlowOne]);

  const isLoading = !enabled || (anyLoading && !(anyData && graceExpired));
  const isError = isAuth
    ? mixedQ.isError
    : adsQ.isError && productsQ.isError && servicesQ.isError;

  const items = interleaveMixed(adsData ?? [], productsData ?? [], servicesData ?? [], limit);

  const personalized = isHydrated && isAuth;
  const title = personalized ? 'مقترحات لك' : 'الأكثر رواجًا';
  const eyebrow = personalized ? 'مخصص لك' : 'رائج الآن';

  return (
    <section className="container mx-auto max-w-7xl space-y-3 rounded-2xl bg-primary/[0.03] px-3 py-3 sm:space-y-4 sm:px-4 sm:py-4">
      <SectionHeader
        tone="personal"
        eyebrow={eyebrow}
        title={title}
        icon={<Sparkles className="h-3.5 w-3.5" />}
        cta={{ href: ROUTES.search, label: 'استكشف المزيد ←' }}
      />

      {isLoading ? (
        <HomeScrollRail>
          {Array.from({ length: Math.min(limit, 6) }).map((_, i) => (
            <HomeScrollRailItem key={i}>
              <AdCardSkeleton />
            </HomeScrollRailItem>
          ))}
        </HomeScrollRail>
      ) : isError ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed py-8 text-center text-sm">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          <p className="text-destructive">تعذّر تحميل الاقتراحات</p>
          <button
            type="button"
            onClick={() => {
              if (isAuth) {
                void mixedQ.refetch();
                return;
              }
              void adsQ.refetch();
              void productsQ.refetch();
              void servicesQ.refetch();
            }}
            className="text-primary hover:underline"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title={isAuth ? 'لا توجد اقتراحات لك بعد' : 'لا توجد اقتراحات حاليًا'}
          description="ستظهر هنا اقتراحات مناسبة عند توفر المزيد من المحتوى."
          compact
        />
      ) : (
        <HomeScrollRail className="stagger-fade-in">
          {items.map((item) => (
            <HomeScrollRailItem key={`${item.kind}-${item.data.id}`}>
              {item.kind === 'ad' ? (
                <AdCard ad={item.data} density="compact" />
              ) : item.kind === 'product' ? (
                <ProductCard product={item.data} />
              ) : (
                <ServiceListingCard listing={item.data} />
              )}
            </HomeScrollRailItem>
          ))}
        </HomeScrollRail>
      )}

      {!isAuth && (
        <p className="text-center text-xs text-muted-foreground">
          <Link href={ROUTES.login} prefetch={false} className="text-primary hover:underline">
            سجّل دخولك
          </Link>
          {' '}لتخصيص الاقتراحات حسب اهتماماتك
        </p>
      )}
    </section>
  );
}
