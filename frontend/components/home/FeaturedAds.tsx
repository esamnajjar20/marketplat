'use client';

import { AdCard }         from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { useAds }         from '@/hooks/queries/useAds';

const DISPLAY_COUNT = 4;
// FIX FEAT-06: the backend has no `isFeatured` query param to filter by
// server-side — it only sorts featured ads first (isPinned DESC,
// isFeatured DESC — see ads.repository.ts). Previously this fetched
// exactly DISPLAY_COUNT ads and filtered client-side, so with fewer
// than DISPLAY_COUNT featured ads in the whole system this section
// showed fewer cards than were actually available, or nothing at all,
// even though more featured ads existed further down the sorted list
// (behind non-featured ads once fewer than DISPLAY_COUNT are featured).
// Fetching a larger page before filtering — and slicing back down to
// DISPLAY_COUNT after — means every currently-featured ad within this
// wider window is found instead of only the first four overall.
const FETCH_COUNT = 20;

export function FeaturedAds() {
  const { data, isLoading } = useAds({ limit: FETCH_COUNT });
  const items = (data?.items?.filter((a) => a.isFeatured) ?? []).slice(0, DISPLAY_COUNT);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: DISPLAY_COUNT }).map((_, i) => <AdCardSkeleton key={i} />)}
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* FIX PERF-05: only the first two cards get priority — a
          reasonable upper bound for "likely above the fold" across the
          grid's responsive breakpoints (1/2/4 columns) without
          over-prioritizing the whole row on the widest layout. */}
      {items.map((ad, i) => <AdCard key={ad.id} ad={ad} priority={i < 2} />)}
    </div>
  );
}
