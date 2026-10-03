'use client';

import { Store as StoreIcon } from 'lucide-react';
import { StoreCard } from '@/components/stores/StoreCard';
import { SectionHeader } from '@/components/home/SectionHeader';
import { HomeScrollRailItem } from '@/components/home/HomeScrollRail';
import { HomeRailShell } from '@/components/home/HomeRailShell';
import { LocationSourceBadge } from '@/components/home/LocationSourceBadge';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { homeSectionLimit } from '@/lib/listLimits';
import { collectIds, dedupeKeepingMin } from '@/lib/homeDedupe';
import { useDataSaver } from '@/lib/useDataSaver';
import { ROUTES } from '@/lib/constants';

export function FeaturedStoresSection() {
  const dataSaver = useDataSaver();
  const limit = homeSectionLimit(6, 4, dataSaver);
  const feed = useHomeFeed();
  const rail = feed.data?.rails.stores;
  const carouselStoreIds = collectIds(feed.data?.featured.carousel.stores?.items);
  const items = dedupeKeepingMin(rail?.items ?? [], carouselStoreIds).slice(0, limit);
  const showLoading = feed.isPending;
  const showError = feed.isError;

  const header = (
    <SectionHeader
      eyebrow="تصفّح"
      title="متاجر تناسبك"
      icon={<StoreIcon className="h-3.5 w-3.5 text-accent" />}
      cta={{ href: ROUTES.stores, label: 'عرض الكل ←' }}
      badge={!showLoading ? <LocationSourceBadge source={rail?.source ?? 'general'} quiet /> : undefined}
    />
  );

  const status = showLoading ? 'loading' : showError ? 'error' : items.length === 0 ? 'empty' : 'ready';

  return (
    <HomeRailShell
      variant="soft"
      header={header}
      status={status}
      skeleton={<StoreCardSkeleton />}
      skeletonCount={limit}
      error={feed.error}
      onRetry={() => void feed.refetch()}
      empty={{
        icon: <StoreIcon />,
        title: 'لا توجد متاجر بعد',
        description: 'ستظهر المتاجر هنا عند توفرها.',
      }}
    >
      {items.map((store) => (
        <HomeScrollRailItem key={store.id} size="store">
          <StoreCard store={store} />
        </HomeScrollRailItem>
      ))}
    </HomeRailShell>
  );
}
