'use client';

import { useHomepage } from '@/hooks/queries/useHomepage';
import { WelcomeBar } from './WelcomeBar';
import { FeaturedCarousel } from './FeaturedCarousel';
import { CategoriesRow } from './CategoriesRow';
import { HomeAboveFold } from './HomeAboveFold';
import { Skeleton } from '@/components/shared/ui/Skeleton';

/**
 * Renders exactly what page.tsx used to render inline for
 * WelcomeBar + FeaturedCarousel + CategoriesRow + HomeAboveFold —
 * the 8-9 requests those four issued individually are now one
 * GET /home, fetched here via useHomepage() and seeded into each
 * component's own react-query cache key before they mount (see
 * useHomepage.ts).
 *
 * On first paint (or if /home errors) each component below still
 * renders and runs its own useQuery as before this change — a
 * slow/broken aggregation endpoint degrades back to the pre-existing
 * per-section requests instead of blocking or blanking the homepage.
 */
export function EagerHomeSections() {
  const homepage = useHomepage();

  // Not `isLoading`: TanStack Query v5's isLoading is `isPending &&
  // isFetching`, so it's FALSE while the query is merely disabled
  // (useHomepage gates on auth hydration) even though there's no
  // data yet — that gap would let this branch mount the real
  // children (and their own, unseeded fetches) before /home ever
  // ran. isPending covers "no data yet" regardless of fetch status.
  if (homepage.isPending) {
    return (
      <div className="pb-2">
        <div className="container mx-auto max-w-7xl space-y-4 px-4 pt-3">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <>
      <WelcomeBar />
      <div className="container mx-auto max-w-7xl space-y-4 px-4 pt-3">
        <FeaturedCarousel />
        <CategoriesRow />
      </div>
      <div className="mt-2">
        <HomeAboveFold />
      </div>
    </>
  );
}
