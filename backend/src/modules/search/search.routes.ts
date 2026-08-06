import { Router } from 'express';
import { searchController } from './search.controller';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { searchSuggestionsRateLimit } from '../../middlewares/rateLimit.middleware';

export const searchRouter = Router();

// Both fully public — same as GET /ads, GET /products, GET /stores.
// SHORT cache (30s) matches the volatility of the underlying lists
// (ads.routes.ts uses the same preset for its own feed).
searchRouter.get('/', CACHE.SHORT, searchController.search);

// Autocomplete gets its own rate limiter (fires on every keystroke,
// not a deliberate submit — see rateLimit.middleware.ts's comment) and
// a shorter cache window matching search.service.ts's Redis TTL, since
// double-caching (CDN + Redis) at mismatched durations would just mean
// the CDN occasionally serves a slightly staler list than Redis holds.
searchRouter.get('/suggestions', searchSuggestionsRateLimit, CACHE.SHORT, searchController.suggest);

// TODO(TRACK-NEARBY-SEARCH): GET /search/nearby — lat/lng-based nearby
// search for the unified ads/products search, deferred and not part of
// this pass. Note this is distinct from service-providers' nearby
// search (GET /service-providers/nearby, service-providers.routes.ts),
// which already ships: Haversine-based, required lat/lng, radius
// optional (km) with a default and a server-side cap to avoid a
// pathological full-table scan (see nearbyServiceProvidersSchema in
// service-providers.validation.ts). Search's Ad/Product models have no
// lat/lng columns yet (unlike ServiceProvider) — implementing this
// endpoint needs that schema addition first, then can likely reuse the
// same radius-cap and coordinate-validation approach as the
// service-providers version rather than a new design.
