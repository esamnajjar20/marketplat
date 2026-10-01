'use client';

import { useEffect, useState } from 'react';
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
import { useAuthStore, selectIsAuthenticated, selectIsHydrated } from '@/store/auth.store';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { ROUTES } from '@/lib/constants';
import type { AdListItem } from '@/types/ad.types';
import type { ProductWithStore } from '@/types/product.types';
import type { ServiceListingWithProvider } from '@/types/service.types';

type MixedItem =
  | { kind: 'ad'; data: AdListItem }
  | { kind: 'product'; data: ProductWithStore }
  | { kind: 'service'; data: ServiceListingWithProvider };

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

const PAGE_LIMIT = 36;
const PER_TYPE = 12;

/**
 * صفحة "اقتراحات لك" — نفس منطق ForYouMixedSection لكن بحد أعلى وعرض شبكة كاملة.
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
  const guestOpts = { enabled: ready && !isAuth, scope: 'guest' } as const;
  const adsQ = useRecommendations({ limit: PER_TYPE, ...cityParam }, guestOpts);
  const productsQ = useProductRecommendations({ limit: PER_TYPE, ...cityParam }, guestOpts);
  const servicesQ = useServiceRecommendations({ limit: PER_TYPE, ...cityParam }, guestOpts);

  const adsData = isAuth ? mixedQ.data?.ads : adsQ.data;
  const productsData = isAuth ? mixedQ.data?.products : productsQ.data;
  const servicesData = isAuth ? mixedQ.data?.services : servicesQ.data;

  const anyLoading = isAuth
    ? mixedQ.isLoading
    : adsQ.isLoading || productsQ.isLoading || servicesQ.isLoading;
  const anyData = Boolean(adsData?.length || productsData?.length || servicesData?.length);

  const [graceExpired, setGraceExpired] = useState(false);
  const waitingOnSlowOne = ready && anyLoading && anyData;
  useEffect(() => {
    if (!waitingOnSlowOne) return;
    const t = setTimeout(() => setGraceExpired(true), 1500);
    return () => clearTimeout(t);
  }, [waitingOnSlowOne]);

  const showLoading = !ready || (anyLoading && !anyData) || (waitingOnSlowOne && !graceExpired);

  const items = interleaveMixed(
    adsData ?? [],
    productsData ?? [],
    servicesData ?? [],
    PAGE_LIMIT,
  );

  return (
    <div className="container mx-auto max-w-7xl space-y-5 px-3 py-5 sm:px-4 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            مخصّص
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
            <AdCardSkeleton key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Sparkles className="h-8 w-8" />}
          title="لا اقتراحات حالياً"
          description="ستظهر هنا اقتراحات مناسبة عند توفر المزيد من المحتوى."
          action={
            <Link
              href={ROUTES.ads}
              className="text-sm font-medium text-primary hover:underline"
            >
              تصفّح الإعلانات
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => {
            if (item.kind === 'ad') {
              return <AdCard key={`ad-${item.data.id}`} ad={item.data} density="compact" />;
            }
            if (item.kind === 'product') {
              return (
                <ProductCard key={`product-${item.data.id}`} product={item.data} density="compact" />
              );
            }
            return (
              <ServiceListingCard
                key={`service-${item.data.id}`}
                listing={item.data}
                density="compact"
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
