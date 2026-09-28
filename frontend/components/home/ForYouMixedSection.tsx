'use client';

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
} from '@/hooks/queries/useRecommendations';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
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
  const { city } = useBrowseCity();

  const adsQ = useRecommendations({ limit: perType, city });
  const productsQ = useProductRecommendations({ limit: perType });
  const servicesQ = useServiceRecommendations({ limit: perType });

  const isLoading = adsQ.isLoading || productsQ.isLoading || servicesQ.isLoading;
  const isError = adsQ.isError && productsQ.isError && servicesQ.isError;

  const items = interleaveMixed(
    adsQ.data ?? [],
    productsQ.data ?? [],
    servicesQ.data ?? [],
    limit,
  );

  if (!isLoading && !isError && items.length < 3) return null;

  const title = isAuth ? 'مقترحات لك' : 'الأكثر رواجًا';
  const eyebrow = isAuth ? 'مخصص لك' : 'رائج الآن';

  return (
    <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3">
      <SectionHeader
        tone="featured"
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
              void adsQ.refetch();
              void productsQ.refetch();
              void servicesQ.refetch();
            }}
            className="text-primary hover:underline"
          >
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <HomeScrollRail className="stagger-fade-in">
          {items.map((item) => (
            <HomeScrollRailItem key={`${item.kind}-${item.data.id}`}>
              {item.kind === 'ad' ? (
                <AdCard ad={item.data} />
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
          <Link href={ROUTES.login} className="text-primary hover:underline">
            سجّل دخولك
          </Link>
          {' '}لتخصيص الاقتراحات حسب اهتماماتك
        </p>
      )}
    </section>
  );
}
