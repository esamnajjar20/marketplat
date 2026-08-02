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

// TODO: nearby search — see design doc (GET /search/nearby, city +
// lat/lng based). Deferred; not part of this pass.
