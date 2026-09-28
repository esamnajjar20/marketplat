'use client';

import { useHomepage } from '@/hooks/queries/useHomepage';
import { HomeDiscoverHero } from './HomeDiscoverHero';
import { HomeCityChips } from './HomeCityChips';
import { HomeTrustStrip } from './HomeTrustStrip';
import { FeaturedCarousel } from './FeaturedCarousel';
import { CategoriesRow } from './CategoriesRow';
import { HomeAboveFold } from './HomeAboveFold';
import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * Above-the-fold homepage block.
 *
 * Phase D: pending skeleton reserves carousel aspect-video + category
 * chips so CLS stays low while GET /home resolves.
 */
export function EagerHomeSections() {
  const homepage = useHomepage();

  if (homepage.isPending) {
    return (
      <div className="pb-2">
        <div className="container mx-auto max-w-7xl space-y-3 px-4 py-4">
          <Skeleton className="h-8 w-2/3 max-w-md rounded-lg" />
          <Skeleton className="h-9 w-56 rounded-xl" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </div>
          <Skeleton className="aspect-video w-full rounded-2xl md:aspect-[21/9] lg:aspect-[3/1]" />
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
      <div className="space-y-3 pt-3">
        <HomeCityChips />
        <HomeTrustStrip />
      </div>
      <div className="container mx-auto max-w-7xl space-y-4 px-4 pt-4">
        <FeaturedCarousel />
        <CategoriesRow />
      </div>
      <div className="mt-2">
        <HomeAboveFold />
      </div>
    </>
  );
}
