'use client';

import { LocateFixed } from 'lucide-react';
import { ServiceProviderCard } from '@/components/services/ServiceProviderCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { useNearbyProvidersForHome } from '@/hooks/queries/useNearbyProvidersForHome';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { ROUTES } from '@/lib/constants';
import { homeSectionLimit } from '@/lib/listLimits';
import { useDataSaver } from '@/lib/useDataSaver';

/**
 * FEAT-HOME-NEARBY-PROVIDERS: "مقدمو خدمات قريبون منك" section for
 * Home. The homepage uses the browse city when available and falls
 * back to the general service-provider directory otherwise.
 *
 * Loading state uses the same horizontal skeleton layout regardless
 * of the active source. The location badge reflects the source of the
 * data currently shown.
 */
export function NearbyProvidersSection() {
  const dataSaver = useDataSaver();
  const limit = homeSectionLimit(6, 4, dataSaver);
  const { isChecking, data, isLoading, isError, source } = useNearbyProvidersForHome();
  const { city } = useBrowseCity();

  const items = (data?.items ?? []).slice(0, limit);
  const showSkeleton = isChecking || isLoading;
  const badgeCity = source === 'city' ? city : undefined;

  const header = (
    <SectionHeader
      eyebrow="قريبون منك"
      title="مقدمو خدمات في مدينتك"
      icon={<LocateFixed className="h-3.5 w-3.5" />}
      cta={{ href: ROUTES.serviceProviders, label: 'عرض الكل ←' }}
      badge={!showSkeleton ? <LocationSourceBadge source={source} city={badgeCity} /> : undefined}
    />
  );

  // Loading covers both the resolver itself settling (isChecking) and
  // the resulting query fetching (isLoading) — shown as one continuous
  // skeleton so there's no flash of nothing while the resolver decides
  // which source to use. A real fetch error just quietly renders
  // nothing further below — no destructive error banner on the
  // homepage for what's a secondary discovery section.
  if (showSkeleton) {
    return (
      <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3">
        {header}
        <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3">
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="w-72 shrink-0 sm:w-auto">
              <StoreCardSkeleton />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Phase B: skip thin rows that look unfinished on the homepage.
  if (isError || items.length < 3) return null;

  return (
    <section className="container mx-auto max-w-7xl space-y-4 px-4 py-2 sm:py-3">
      {header}
      <div className="flex gap-3 overflow-x-auto pb-1 sm:grid sm:grid-cols-2 sm:overflow-visible sm:pb-0 lg:grid-cols-3 stagger-fade-in">
        {items.map((provider) => (
          <div key={provider.id} className="w-72 shrink-0 sm:w-auto">
            <ServiceProviderCard provider={provider} />
          </div>
        ))}
      </div>
    </section>
  );
}
