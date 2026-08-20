'use client';

import { AdCard }         from '@/components/ads/AdCard';
import { AdCardSkeleton } from '@/components/shared/skeletons/AdCardSkeleton';
import { ApiError }       from '@/components/shared/ApiError';
import { useAds }         from '@/hooks/queries/useAds';

const DISPLAY_COUNT = 4;

// FIX FEAT-06 (superseded): this used to fetch a wider page (20) and
// filter isFeatured client-side, because the backend had no isFeatured
// query param — it only sorted featured ads first. That broke once the
// marketplace grew past a small number of ads: if fewer than the
// fetched-window size were currently featured, some or all of them
// could sit further down the isFeatured-sorted list than the window
// reached, so this section would show fewer cards than actually exist,
// or nothing at all, even though featured ads were live elsewhere.
// The backend now accepts `isFeatured` directly (ads.validation.ts +
// ads.repository.ts, indexed via the existing [isFeatured, isPinned]
// index), so this always gets an accurate count regardless of scale.
export function FeaturedAds() {
  const { data, isLoading, isError, error, refetch } = useAds({ isFeatured: true, limit: DISPLAY_COUNT });
  const items = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: DISPLAY_COUNT }).map((_, i) => <AdCardSkeleton key={i} />)}
      </div>
    );
  }

  // FIX UI-REVIEW-ERROR-STATE: previously `if (items.length === 0)
  // return null` treated a failed request identically to "no featured
  // ads right now" — this section (inside a visually distinct
  // bg-accent band, per HomeAboveFold) just vanished on a network
  // failure with nothing to explain why the band above it had a
  // heading but no content. isError is checked first so a genuine
  // empty state (items.length === 0 with no error) still self-hides
  // exactly as before — only an actual fetch failure now surfaces.
  if (isError) {
    return <ApiError error={error} onRetry={refetch} variant="inline" />;
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
