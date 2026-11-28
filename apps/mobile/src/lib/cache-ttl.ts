/**
 * Single home for the mobile app's in-memory freshness windows.
 * Categories come from the shared policy (reference bucket). The two home
 * sections keep their original mobile-specific values (10-15 min) rather
 * than reading publicLive / publicHome (90 s): re-fetching every 90 s on
 * mobile data would be a real cost to the user. The persisted public cache
 * (SQLite) keeps its own limits in storage/public-cache-policy.ts.
 */
import { MOBILE_CACHE_POLICY } from '../cachePolicy.generated';

/** Home: products / services / requests sections — shared mobile policy. */
export const HOME_PUBLIC_LIST_TTL_MS = MOBILE_CACHE_POLICY.mobile.home.publicListsStaleTimeMs;
/** Home: public stores carousel — shared mobile policy. */
export const HOME_PUBLIC_STORES_TTL_MS = MOBILE_CACHE_POLICY.mobile.home.publicStoresStaleTimeMs;
/** Public category tree held in module memory (reference policy — 5 min). */
export const CATEGORY_MEMORY_TTL_MS = MOBILE_CACHE_POLICY.reference.client.staleTimeMs;
