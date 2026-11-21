'use client';

import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { HomeDiscoverHero } from './HomeDiscoverHero';
import { HomeContextStrip } from './HomeContextStrip';
import { HomeTypeShortcuts } from './HomeTypeShortcuts';
import { CAROUSEL_ASPECT, FeaturedCarousel } from './FeaturedCarousel';
import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * Homepage first-screen order:
 * Hero (search) → type shortcuts → city context → featured carousel.
 *
 * UX-IMPROVEMENT Phase 1.2 (2026-11-21):
 * Re-introduced HomeTypeShortcuts *below* the hero (not inside it) so
 * discovery of Ads / Products / Services / Stores is one tap away without
 * duplicating the search field. Kept compact and outside the hero gradient
 * to avoid visual noise.
 */
export function EagerHomeSections() {
  const feed = useHomeFeed();

  if (feed.isPending) {
    return (
      <div className="pb-2">
        <div className="container mx-auto max-w-7xl space-y-3 px-4 py-4">
          <Skeleton className="h-8 w-2/3 max-w-md rounded-lg" />
          <Skeleton className="h-12 w-full rounded-2xl" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[4.5rem] rounded-2xl" />
            ))}
          </div>
          <Skeleton className={`${CAROUSEL_ASPECT} w-full rounded-2xl`} />
        </div>
      </div>
    );
  }

  return (
    <>
      <HomeDiscoverHero />
      <div className="container mx-auto max-w-7xl px-3 pt-3 sm:px-4 sm:pt-4">
        <HomeTypeShortcuts />
      </div>
      <div className="space-y-3 pt-3 sm:space-y-4 sm:pt-4">
        <HomeContextStrip />
      </div>
      <div className="container mx-auto max-w-7xl space-y-4 px-3 pt-3 sm:space-y-5 sm:px-4 sm:pt-4">
        <FeaturedCarousel />
      </div>
    </>
  );
}
