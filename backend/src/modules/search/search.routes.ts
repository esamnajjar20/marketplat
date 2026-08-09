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

// TRACK-NEARBY-SEARCH: lat/lng-based nearby search for the unified
// ads/products/stores/services search now lives on this same GET /
// endpoint (searchController.search) rather than a separate
// /search/nearby route — pass lat/lng(+radius) query params and
// optionally sort=distance. Ad/StoreDetails now carry their own
// latitude/longitude columns (StoreDetails already did; Ad gained them
// in the add_ad_geolocation migration), Product/ServiceListing resolve
// theirs via their store/provider join — see search.repository.ts's
// header comment and haversineExprSql/boundingBoxSql for the shared
// Haversine + bounding-box approach, deliberately reusing the same
// math GET /service-providers/nearby already established
// (service-providers.repository.ts's findNearby) rather than a new
// design.
