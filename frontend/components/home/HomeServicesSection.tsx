'use client';

import { Briefcase } from 'lucide-react';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { HomeScrollRailItem } from '@/components/home/HomeScrollRail';
import { HomeRailShell } from '@/components/home/HomeRailShell';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { ServiceListingCardSkeleton } from '@/components/shared/skeletons';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { homeSectionLimit } from '@/lib/listLimits';
import { dedupeKeepingMin } from '@/lib/homeDedupe';
import { forYouIdsOf, useForYouItems } from '@/hooks/queries/useForYouItems';
import { useDataSaver } from '@/lib/useDataSaver';
import { ROUTES } from '@/lib/constants';

export function HomeServicesSection() {
  const dataSaver = useDataSaver();
  const limit = homeSectionLimit(8, 4, dataSaver);
  const feed = useHomeFeed();
  const rail = feed.data?.rails.services;
  const shownAbove = forYouIdsOf(useForYouItems(), 'service');
  const items = dedupeKeepingMin(rail?.items ?? [], shownAbove).slice(0, limit);
  const showLoading = feed.isPending;
  const showError = feed.isError;

  const header = (
    <SectionHeader
      eyebrow="تصفّح"
      title="خدمات تناسبك"
      icon={<Briefcase className="h-3.5 w-3.5" />}
      cta={{ href: ROUTES.services, label: 'عرض الكل ←' }}
      badge={
        !showLoading ? (
          <LocationSourceBadge source={rail?.source ?? 'general'} quiet />
        ) : undefined
      }
    />
  );

  const status = showLoading ? 'loading' : showError ? 'error' : items.length === 0 ? 'empty' : 'ready';

  return (
    <HomeRailShell
      variant="default"
      header={header}
      status={status}
      skeleton={<ServiceListingCardSkeleton />}
      skeletonCount={4}
      error={feed.error}
      onRetry={() => void feed.refetch()}
      empty={{
        icon: <Briefcase />,
        title: 'لا توجد خدمات بعد',
        description: 'ستظهر الخدمات هنا عند توفرها.',
      }}
    >
      {items.map((listing) => (
        <HomeScrollRailItem key={listing.id}>
          <ServiceListingCard listing={listing} context="public" />
        </HomeScrollRailItem>
      ))}
    </HomeRailShell>
  );
}
