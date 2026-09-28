'use client';

import { Briefcase } from 'lucide-react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { HomeScrollRail, HomeScrollRailItem } from '@/components/home/HomeScrollRail';
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
  const hasSeed = seeded !== null && seeded !== undefined;
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
          <LocationSourceBadge
            source={seeded?.source ?? (city ? 'city' : 'general')}
            city={seeded?.source === 'city' ? city : undefined}
            requestedCity={city}
            quiet
          />
        ) : undefined
      }
    />
  );

  if (showLoading) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3 section-enter">
        {header}
        <HomeScrollRail>
          {Array.from({ length: 4 }).map((_, i) => (
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

  if (items.length === 0) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3 section-enter">
        {header}
        <EmptyState
          icon={<Briefcase />}
          title="لا توجد خدمات بعد"
          description="ستظهر الخدمات هنا عند توفرها."
          compact
        />
      </section>
    );
  }

  return (
    <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3 section-enter">
      {header}
      <HomeScrollRail className="stagger-fade-in">
        {items.map((listing) => (
          <HomeScrollRailItem key={listing.id}>
            <ServiceListingCard listing={listing} />
          </HomeScrollRailItem>
        ))}
      </HomeScrollRail>
    </section>
  );
}
