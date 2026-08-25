'use client';

import { Sparkle } from 'lucide-react';
import { StoreCard } from '@/components/stores/StoreCard';
import { StoreCardSkeleton } from '@/components/shared/skeletons';
import { RecommendationRail } from './RecommendationRail';
import { useStoreRecommendations } from '@/hooks/queries/useRecommendations';
import { useSilentCoordinates } from '@/hooks/useSilentCoordinates';

const DISPLAY_COUNT = 6;
// StoreCard is a horizontal round-avatar row (see StoreCardSkeleton's
// own comment), not the square/4:3 image card ProductCard/
// ServiceListingCard are — same grid RecentStores.tsx already uses
// for the identical layout reason.
const STORE_GRID = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4';

interface Props {
  /** Excludes the store currently being viewed on its own public page. */
  excludeStoreId: string;
}

/**
 * "متاجر قد تعجبك" — integrated into the public store detail page.
 * lat/lng are read silently (never prompting for permission — see
 * useSilentCoordinates' own comment) and simply omitted when
 * unavailable; the backend's storeRecommendationsRepository.findRanked
 * ranking formula works fine without them (freshness/activity →
 * distance-if-present → limited plan boost → createdAt).
 */
export function StoreRecommendations({ excludeStoreId }: Props) {
  const coords = useSilentCoordinates();
  const { data, isLoading, isError, refetch } = useStoreRecommendations({
    limit: DISPLAY_COUNT,
    excludeStoreId,
    lat: coords?.lat,
    lng: coords?.lng,
  });

  return (
    <RecommendationRail
      title="متاجر قد تعجبك"
      icon={<Sparkle className="h-4 w-4 text-muted-foreground" />}
      items={data}
      isLoading={isLoading}
      isError={isError}
      refetch={refetch}
      getItemKey={(store) => store.id}
      renderItem={(store) => <StoreCard store={store} />}
      renderSkeleton={() => <StoreCardSkeleton />}
      gridClassName={STORE_GRID}
      skeletonCount={DISPLAY_COUNT}
    />
  );
}
