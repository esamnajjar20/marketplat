'use client';

import { Sparkle } from 'lucide-react';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { ServiceListingCardSkeleton } from '@/components/shared/skeletons';
import { RecommendationRail } from './RecommendationRail';
import { useServiceRecommendations } from '@/hooks/queries/useRecommendations';

const DISPLAY_COUNT = 8;

interface Props {
  /** Excludes the listing currently being viewed on its own detail page. */
  excludeServiceListingId: string;
}

/** "خدمات قد تعجبك" — integrated into the service listing detail page. */
export function ServiceRecommendations({ excludeServiceListingId }: Props) {
  const { data, isLoading, isError, refetch } = useServiceRecommendations({
    limit: DISPLAY_COUNT,
    excludeServiceListingId,
  });

  return (
    <RecommendationRail
      title="خدمات قد تعجبك"
      icon={<Sparkle className="h-4 w-4 text-muted-foreground" />}
      items={data}
      isLoading={isLoading}
      isError={isError}
      refetch={refetch}
      getItemKey={(listing) => listing.id}
      renderItem={(listing) => <ServiceListingCard listing={listing} />}
      renderSkeleton={() => <ServiceListingCardSkeleton />}
      skeletonCount={DISPLAY_COUNT}
    />
  );
}
