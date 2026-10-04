'use client';

import { AdCard } from '@/components/ads/AdCard';
import { HomeScrollRail, HomeScrollRailItem } from '@/components/home/HomeScrollRail';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { ApiError } from '@/components/shared/ApiError';
import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { useDataSaver } from '@/lib/useDataSaver';
import { forYouIdsOf, useForYouItems } from '@/hooks/queries/useForYouItems';
import { dedupeKeepingMin } from '@/lib/homeDedupe';

/** Ads come from the single homepage feed: city priority + interest + freshness backfill, minus what "مخصص لك" already shows. */
export function RecentAds() {
  const dataSaver = useDataSaver();
  const feed = useHomeFeed();
  const limit = dataSaver ? 6 : 8;
  const shownAbove = forYouIdsOf(useForYouItems(), 'ad');
  // The "مخصص لك" shelf sits above this rail: drop the ads it already shows.
  const items = dedupeKeepingMin(feed.data?.rails.ads.items ?? [], shownAbove).slice(0, limit);

  if (feed.isPending) {
    return (
      <HomeScrollRail>
        {Array.from({ length: 6 }).map((_, i) => (
          <HomeScrollRailItem key={i} size="wide"><AdCardSkeleton /></HomeScrollRailItem>
        ))}
      </HomeScrollRail>
    );
  }

  if (feed.isError) return <ApiError error={feed.error} onRetry={() => void feed.refetch()} variant="inline" />;

  return (
    <HomeScrollRail className="stagger-fade-in">
      {items.map((ad, i) => (
        <HomeScrollRailItem key={ad.id} size="wide">
          <AdCard ad={ad} context="public" priority={i < 2} density="compact" />
        </HomeScrollRailItem>
      ))}
    </HomeScrollRail>
  );
}
