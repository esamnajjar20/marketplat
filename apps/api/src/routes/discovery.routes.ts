import type { Router } from 'express';
import { homeRouter } from '../modules/discovery/home';
import { searchRouter } from '../modules/discovery/search';
import { recommendationsRouter } from '../modules/discovery/recommendations';

/** Ways users find things: homepage feed, cross-entity search, recommendations. */
export function registerDiscoveryRoutes(router: Router): void {
  // Aggregates the above-the-fold public homepage sections (FeaturedCarousel,
  // CategoriesRow, HomeAboveFold's city/general ads) into one request —
  // see home.validation.ts for exactly what is/isn't included and why.
  router.use('/home', homeRouter);
  // A-05 (historical): /search was merged into /ads/search because at
  // the time it only ever covered ads — a dedicated module was
  // redundant for a single entity. /ads/search is untouched by this
  // change and still works exactly as before. This /search is a
  // different thing: a real cross-entity module (ads + products +
  // stores + service-listings unioned and ranked together), which A-05
  // never addressed and doesn't apply to.
  router.use('/search', searchRouter);
  // Gap #9 ("قد يعجبك أيضًا" / Recommendations): its own repository-backed
  // module (not folded into ads.routes.ts's existing /:id/related, which
  // is a simpler category+city match) — this one blends favorites,
  // UserActivity, and AnalyticsEvent signals, and works both personalized
  // (logged-in) and anonymous (trending fallback). See recommendations
  // .service.ts's own comment for the full scoring rationale.
  router.use('/recommendations', recommendationsRouter);
}
