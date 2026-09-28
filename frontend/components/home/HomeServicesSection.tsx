'use client';

import { Briefcase } from 'lucide-react';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { ApiError } from '@/components/shared/ApiError';
import { useServiceListings } from '@/hooks/queries/useServiceListings';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { homeSectionLimit } from '@/lib/listLimits';
import { useDataSaver } from '@/lib/useDataSaver';
import { ROUTES } from '@/lib/constants';

/**
 * خدمات الرئيسية — مدينة البروفايل أو اختيار الضيف (بدون GPS).
 */
export function HomeServicesSection() {
  const dataSaver = useDataSaver();
  const limit = homeSectionLimit(8, 4, dataSaver);
  const { city } = useBrowseCity();
  const home = useHomepage();
  const seeded = home.data?.belowFold?.homeServices ?? null;
  const hasSeed = Boolean(seeded?.items?.length);
  const allowFetch = home.isError || (home.isSuccess && !hasSeed);

  const { data, isLoading, isError, error, refetch } = useServiceListings(
    {
      limit,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      ...(city ? { city } : {}),
    },
    { enabled: allowFetch },
  );

  const items = hasSeed ? (seeded!.items ?? []).slice(0, limit) : (data?.items ?? []);
  const showLoading = hasSeed ? false : home.isPending || isLoading;
  const showError = hasSeed ? false : isError;

  const header = (
    <SectionHeader
      eyebrow="تصفّح"
      title="خدمات"
      icon={<Briefcase className="h-3.5 w-3.5" />}
      cta={{ href: ROUTES.services, label: 'عرض الكل ←' }}
      badge={
        !showLoading ? (
          <LocationSourceBadge source={city ? 'city' : 'general'} city={city} />
        ) : undefined
      }
    />
  );

  if (showLoading) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3 section-enter">
        {header}
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
          {Array.from({ length: 4 }).map((_, i) => (
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

  // Phase B: skip thin rows that look unfinished on the homepage.
  if (items.length < 3) return null;

  return (
    <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3 section-enter">
      {header}
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 snap-x snap-mandatory stagger-fade-in [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {items.map((listing) => (
          <div key={listing.id} className="w-[min(72vw,280px)] shrink-0 snap-start sm:w-[240px]">
            <ServiceListingCard listing={listing} />
          </div>
        ))}
      </div>
    </section>
  );
}
