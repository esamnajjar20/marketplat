'use client';

import { useHomeFeed } from '@/hooks/queries/useHomeFeed';
import { HomeDiscoverHero } from './HomeDiscoverHero';
import { HomeContextStrip } from './HomeContextStrip';
import { FeaturedCarousel } from './FeaturedCarousel';
import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * Homepage first-screen order: search + quick type shortcuts (from HomeDiscoverHero),
 * city context strip, then the featured carousel. The old CategoriesRow that
 * duplicated the shortcuts has been removed.
 */
export function EagerHomeSections() {
  const feed = useHomeFeed();

  if (feed.isPending) {
    return (
      <div className="pb-2">
        <div className="container mx-auto max-w-7xl space-y-3 px-4 py-4">
          <Skeleton className="h-8 w-2/3 max-w-md rounded-lg" />
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="aspect-video w-full rounded-2xl md:aspect-[21/9]" />
        </div>
      </div>
    );
  }

  return (
    <>
      <HomeDiscoverHero />
      <div className="space-y-3 pt-3 sm:space-y-4 sm:pt-4">
        <HomeContextStrip />
      </div>
      <div className="container mx-auto max-w-7xl space-y-4 px-3 pt-3 sm:space-y-5 sm:px-4 sm:pt-4">
        <FeaturedCarousel />
      </div>
    </>
  );
}
