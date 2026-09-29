'use client';

import { useHomepage } from '@/hooks/queries/useHomepage';
import { HomeDiscoverHero } from './HomeDiscoverHero';
import { HomeContextStrip } from './HomeContextStrip';
import { HomeTypeShortcuts } from './HomeTypeShortcuts';
import { FeaturedCarousel } from './FeaturedCarousel';
import { CategoriesRow } from './CategoriesRow';
import { HomeAboveFold } from './HomeAboveFold';
import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * Above-the-fold homepage block (UI-HOME-01).
 *
 * Order (paid featured first):
 * 1. Compact hero (publish / explore)
 * 2. Context strip (city + activity)
 * 3. Featured carousel — paid placement
 * 4. Type shortcuts (ads / products / services / stores)
 * 5. Category chips (max 10)
 * 6. Latest organic ads
 */
export function EagerHomeSections() {
  const homepage = useHomepage();

  if (homepage.isPending) {
    return (
      <div className="pb-2">
        <div className="container mx-auto max-w-7xl space-y-3 px-4 py-4">
          <Skeleton className="h-8 w-2/3 max-w-md rounded-lg" />
          <Skeleton className="h-9 w-40 rounded-xl" />
          <Skeleton className="h-10 w-full rounded-2xl" />
          <Skeleton className="aspect-video w-full rounded-2xl md:aspect-[21/9] lg:aspect-[3/1]" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </div>
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-20 shrink-0 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <HomeDiscoverHero />

      <div className="space-y-2.5 pt-2.5 sm:space-y-3 sm:pt-3">
        <HomeContextStrip />
      </div>

      {/* Paid featured — first primary content block */}
      <div className="container mx-auto max-w-7xl px-3 pt-2.5 sm:px-4 sm:pt-3">
        <FeaturedCarousel />
      </div>

      <div className="space-y-2.5 pt-2.5 sm:space-y-3 sm:pt-3">
        <HomeTypeShortcuts />
      </div>

      <div className="container mx-auto max-w-7xl px-3 pt-2.5 sm:px-4 sm:pt-3">
        <CategoriesRow />
      </div>

      <div className="mt-0.5 sm:mt-1">
        <HomeAboveFold />
      </div>
    </>
  );
}
