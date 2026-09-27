import { z } from 'zod';

/**
 * GET /home aggregates every above-the-fold request the public
 * homepage used to fire separately (FeaturedCarousel, CategoriesRow,
 * HomeAboveFold's city/general ads) into one round trip.
 *
 * `city` is optional and mirrors useAdsForHome's cityQuery: the
 * frontend only has a city to send once useLocationResolver resolves
 * source === 'city' (it comes from the auth store, so it's available
 * synchronously for a logged-in user with a saved city — no network
 * wait required client-side). When omitted, only the general ads
 * feed is computed.
 *
 * Deliberately NOT included here: NearbyProvidersSection,
 * PromotedProductsSection, RecentProductsSection, HomeServicesSection,
 * FeaturedStoresSection, RecommendedAds — those stay behind
 * LazySection (whenIdle, staggered rootMargin) on purpose, and the
 * GPS progressive-radius search in useSequentialGeoSearch is a
 * deliberate one-radius-at-a-time design for weak networks (see that
 * hook's own comment) — collapsing either into this endpoint would
 * undo an intentional perf choice, not fix one.
 */
export const getHomepageSchema = z.object({
  query: z.object({
    city: z.string().max(100).optional(),
  }),
});

export type GetHomepageQuery = z.infer<typeof getHomepageSchema>['query'];
