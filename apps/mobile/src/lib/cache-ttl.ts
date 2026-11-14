/**
 * Single home for the mobile app's in-memory freshness windows.
 * Categories come from the shared policy (reference bucket). The two home
 * sections keep their original mobile-specific values (10-15 min) rather
 * than reading publicLive / publicHome (90 s): re-fetching every 90 s on
 * mobile data would be a real cost to the user. The persisted public cache
 * (SQLite) keeps its own limits in storage/public-cache-policy.mjs.
 */
import policy from '../../../../shared/cache-policy.json';

/** Home: products / services / requests sections — 15 min. */
export const HOME_PUBLIC_LIST_TTL_MS = 15 * 60 * 1000;
/** Home: public stores carousel — 10 min. */
export const HOME_PUBLIC_STORES_TTL_MS = 10 * 60 * 1000;
/** Public category tree held in module memory (reference policy — 5 min). */
export const CATEGORY_MEMORY_TTL_MS = policy.reference.client.staleTimeMs;
