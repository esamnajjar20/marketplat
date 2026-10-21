'use client';

import { useQuery } from '@tanstack/react-query';
import { Layers3 } from 'lucide-react';
import { serviceListingsApi } from '@/api/service-listings.api';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { ServiceListingCardSkeleton } from '@/components/shared/skeletons';
import { queryKeys } from '@/lib/queryKeys';
import { LIST_SERVICE_GRID_CLASS } from '@/components/shared/list/ListPageShell';

export function ServiceListingMatches({ listingId }: { listingId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.serviceListingMatches(listingId),
    queryFn: () => serviceListingsApi.getMatches(listingId, 8).then((r) => r.data.data ?? []),
    staleTime: 5 * 60_000,
  });

  if (isLoading && !data) return <section className="space-y-3 border-t pt-6"><h2 className="flex items-center gap-2 font-semibold"><Layers3 className="h-4 w-4" />مقدمون مناسبون أيضًا</h2><div className={LIST_SERVICE_GRID_CLASS}>{Array.from({ length: 4 }).map((_, i) => <ServiceListingCardSkeleton key={i} />)}</div></section>;
  if (!data?.length) return null;

  return (
    <section className="space-y-3 border-t pt-6" aria-label="مقدمون مناسبون أيضًا">
      {isError && data.length > 0 && (
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground" role="status">
          <span>تعذّر تحديث الاقتراحات؛ تُعرض آخر نسخة محفوظة.</span>
          <button type="button" className="shrink-0 underline underline-offset-4" onClick={() => void refetch()}>إعادة المحاولة</button>
        </div>
      )}
      <h2 className="flex items-center gap-2 font-semibold"><Layers3 className="h-4 w-4" />مقدمون مناسبون أيضًا</h2>
      <div className={LIST_SERVICE_GRID_CLASS}>
        {data.map((listing) => <ServiceListingCard key={listing.id} listing={listing} context="related" />)}
      </div>
    </section>
  );
}
