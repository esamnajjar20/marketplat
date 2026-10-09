'use client';

import { useQuery } from '@tanstack/react-query';
import { Layers3 } from 'lucide-react';
import { serviceListingsApi } from '@/api/service-listings.api';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { ServiceListingCardSkeleton } from '@/components/shared/skeletons';
import { queryKeys } from '@/lib/queryKeys';

export function ServiceListingMatches({ listingId }: { listingId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.serviceListingMatches(listingId),
    queryFn: () => serviceListingsApi.getMatches(listingId, 8).then((r) => r.data.data ?? []),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return <section className="space-y-3 border-t pt-6"><h2 className="flex items-center gap-2 font-semibold"><Layers3 className="h-4 w-4" />مقدمون مناسبون أيضًا</h2><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <ServiceListingCardSkeleton key={i} />)}</div></section>;
  if (!data?.length) return null;

  return (
    <section className="space-y-3 border-t pt-6" aria-label="مقدمون مناسبون أيضًا">
      <h2 className="flex items-center gap-2 font-semibold"><Layers3 className="h-4 w-4" />مقدمون مناسبون أيضًا</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {data.map((listing) => <ServiceListingCard key={listing.id} listing={listing} context="related" />)}
      </div>
    </section>
  );
}
