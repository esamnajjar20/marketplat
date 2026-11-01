export const MAX_PUBLIC_CACHE_ENTRIES: number;
export const MAX_PUBLIC_CACHE_BYTES: number;
export const PUBLIC_CACHE_MAX_STALE_MS: number;
export const PRIVATE_CACHE_MAX_STALE_MS: number;
export const CACHE_CLOCK_SKEW_TOLERANCE_MS: number;
export function maxCacheAgeForKey(cacheKey: string): number;
export function isPublicCacheEntryUsable(cacheKey: string, savedAt: number, now?: number): boolean;
export function planPublicCacheEviction(
  entries: ReadonlyArray<{ cacheKey: string; savedAt: number; sizeBytes: number }>,
  limits?: { maxEntries?: number; maxBytes?: number },
): string[];
