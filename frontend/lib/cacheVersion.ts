/**
 * Single source of truth for the PWA cache version used by TypeScript modules.
 *
 * public/sw.js is a classic service-worker script (not an ES module) and
 * cannot import this file. It keeps its own `const CACHE_VERSION = 'vNN'`
 * which MUST match SW_CACHE_VERSION below — enforced by
 * __tests__/unit/lib/cacheVersionSync.test.ts.
 *
 * Bump BOTH this value and sw.js's CACHE_VERSION together whenever cache
 * strategy, shell routes, or fetch handlers change.
 */
export const SW_CACHE_VERSION = 'v43' as const;

export const STATIC_CACHE_NAME = `market-static-${SW_CACHE_VERSION}`;
export const CORE_CACHE_NAME = `market-core-${SW_CACHE_VERSION}`;
export const USER_DATA_CACHE_NAME = `market-user-data-${SW_CACHE_VERSION}`;
export const PERSONAL_SHELL_CACHE_NAME = `market-personal-shell-${SW_CACHE_VERSION}`;
export const API_CACHE_NAME = `market-api-${SW_CACHE_VERSION}`;
export const IMAGE_CACHE_NAME = `market-images-${SW_CACHE_VERSION}`;
