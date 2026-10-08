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
export const SW_CACHE_VERSION = 'v49' as const;

export const STATIC_CACHE_NAME = `market-static-${SW_CACHE_VERSION}`;
export const CORE_CACHE_NAME = `market-core-${SW_CACHE_VERSION}`;
export const USER_DATA_CACHE_PREFIX = `market-user-data-${SW_CACHE_VERSION}-`;

/** Per-user cache partition. The user id is encoded because Cache Storage names are plain strings. */
export function userDataCacheName(userId: string): string {
  return `${USER_DATA_CACHE_PREFIX}${encodeURIComponent(userId)}`;
}

/** Legacy/static name retained only for migration imports; new user data must use userDataCacheName(). */
export const USER_DATA_CACHE_NAME = `${USER_DATA_CACHE_PREFIX}legacy`;
export const PERSONAL_SHELL_CACHE_NAME = `market-personal-shell-${SW_CACHE_VERSION}`;
export const API_CACHE_NAME = `market-api-${SW_CACHE_VERSION}`;
export const IMAGE_CACHE_NAME = `market-images-${SW_CACHE_VERSION}`;
