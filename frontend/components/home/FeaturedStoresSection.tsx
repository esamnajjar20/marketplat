'use client';

import { Store as StoreIcon } from 'lucide-react';
import { StoreCard } from '@/components/stores/StoreCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ApiError } from '@/components/shared/ApiError';
import { useStores } from '@/hooks/queries/useStores';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { homeSectionLimit } from '@/lib/listLimits';
import { useDataSaver } from '@/lib/useDataSaver';
import { ROUTES } from '@/lib/constants';

/**
 * متاجر مميزة — يفضّل belowFold من GET /home.
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
  const items = hasSeed ? (seeded!.items ?? []).slice(0, limit) : (data?.items ?? []);
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
          <LocationSourceBadge source={badgeSource} city={badgeCity} />
        ) : undefined
      }
    />
  );

  if (showLoading) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3 section-enter">
        {header}
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="w-[min(72vw,280px)] shrink-0 snap-start sm:w-[240px]">
              <StoreCardSkeleton />
            </div>
          ))}
        </div>
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
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory stagger-fade-in [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {items.map((store) => (
            <div key={store.id} className="w-[min(72vw,280px)] shrink-0 snap-start sm:w-[240px]">
              <StoreCard store={store} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
