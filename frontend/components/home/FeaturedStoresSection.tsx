'use client';

import { Store as StoreIcon } from 'lucide-react';
import { StoreCard } from '@/components/stores/StoreCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { HomeScrollRail, HomeScrollRailItem } from '@/components/home/HomeScrollRail';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ApiError } from '@/components/shared/ApiError';
import { useStores } from '@/hooks/queries/useStores';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { homeSectionLimit } from '@/lib/listLimits';
import { collectIds, dedupeKeepingMin } from '@/lib/homeDedupe';
import { useDataSaver } from '@/lib/useDataSaver';
import { ROUTES } from '@/lib/constants';

/**
 * قسم "متاجر" في الرئيسية — يفضّل belowFold.featuredStores من GET /home.
 *
 * ملاحظة تسمية: رغم اسم المكوّن، هذا القسم يعرض متاجر المدينة/العامة
 * (getStores) وليس المتاجر ذات الخطة FEATURED؛ المتاجر المميزة تظهر في
 * FeaturedCarousel أعلى الصفحة. العنوان المعروض "متاجر" صحيح، والاسم
 * التاريخي للمكوّن أُبقي لتفادي كسر الاستيرادات والاختبارات.
 */
export function FeaturedStoresSection() {
  const dataSaver = useDataSaver();
  const limit = homeSectionLimit(6, 4, dataSaver);
  const { city } = useBrowseCity();
  const home = useHomepage();
  const seeded = home.data?.belowFold?.featuredStores ?? null;
  const hasSeed = seeded !== null && seeded !== undefined;
  const allowFetch = home.isError || (home.isSuccess && !hasSeed);

  const { data, isLoading, isError, error, refetch } = useStores(
    { limit, city },
    { enabled: allowFetch },
  );
  // Stores already featured in the carousel are not repeated here.
  const carouselStoreIds = collectIds(home.data?.featuredCarousel?.stores?.items);
  const items = hasSeed
    ? dedupeKeepingMin(seeded!.items ?? [], carouselStoreIds).slice(0, limit)
    : (data?.items ?? []);
  const showLoading = hasSeed ? false : home.isPending || isLoading;
  const showError = hasSeed ? false : isError;

  const badgeSource = seeded?.source ?? (city ? 'city' : 'general');
  const badgeCity = badgeSource === 'city' ? city : undefined;

  const header = (
    <SectionHeader
      eyebrow="تصفّح"
      title="متاجر"
      icon={<StoreIcon className="h-3.5 w-3.5 text-accent" />}
      cta={{ href: ROUTES.stores, label: 'عرض الكل ←' }}
      badge={
        !showLoading ? (
          <LocationSourceBadge source={badgeSource} city={badgeCity} requestedCity={city} quiet />
        ) : undefined
      }
    />
  );

  if (showLoading) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3 section-enter">
        {header}
        <HomeScrollRail>
          {Array.from({ length: limit }).map((_, i) => (
            <HomeScrollRailItem key={i}>
              <StoreCardSkeleton />
            </HomeScrollRailItem>
          ))}
        </HomeScrollRail>
      </section>
    );
  }

  if (showError) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3">
        {header}
        <ApiError
          error={error}
          onRetry={() => {
            void home.refetch();
            void refetch();
          }}
          variant="inline"
        />
      </section>
    );
  }

  return (
    <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3 section-enter">
      {header}
      {items.length === 0 ? (
        <EmptyState
          icon={<StoreIcon />}
          title="لا توجد متاجر بعد"
          description="ستظهر المتاجر هنا عند توفرها."
          compact
        />
      ) : (
        <HomeScrollRail className="stagger-fade-in">
          {items.map((store) => (
            <HomeScrollRailItem key={store.id}>
              <StoreCard store={store} />
            </HomeScrollRailItem>
          ))}
        </HomeScrollRail>
      )}
    </section>
  );
}
