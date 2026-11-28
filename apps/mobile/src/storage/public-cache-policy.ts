import { MOBILE_CACHE_POLICY } from '../cachePolicy.generated';

/**
 * Public-cache policy shared by the SQLite adapter and dependency-free Node tests.
 * Explicitly saved-offline resources live in their own table and are not expired here.
 * All budgets and freshness windows are owned by shared/cache-policy.json.
 */
const PUBLIC_CACHE_POLICY = MOBILE_CACHE_POLICY.mobile.storage.publicCache;
export const MAX_PUBLIC_CACHE_ENTRIES = PUBLIC_CACHE_POLICY.maxEntries;
export const MAX_PUBLIC_CACHE_BYTES = PUBLIC_CACHE_POLICY.maxBytes;
export const MAX_PUBLIC_CACHE_ENTRY_CHARS = PUBLIC_CACHE_POLICY.maxEntryChars;
export const MAX_PUBLIC_CACHE_ENTRY_BYTES = PUBLIC_CACHE_POLICY.maxEntryBytes;
export const PUBLIC_CACHE_MAX_STALE_MS = PUBLIC_CACHE_POLICY.publicMaxStaleMs;
export const PRIVATE_CACHE_MAX_STALE_MS = PUBLIC_CACHE_POLICY.privateMaxStaleMs;
export const CACHE_CLOCK_SKEW_TOLERANCE_MS = PUBLIC_CACHE_POLICY.clockSkewToleranceMs;

export function maxCacheAgeForKey(cacheKey: string): number {
  return typeof cacheKey === 'string' && cacheKey.startsWith('api-private:')
    ? PRIVATE_CACHE_MAX_STALE_MS
    : PUBLIC_CACHE_MAX_STALE_MS;
}

export function isPublicCacheEntryUsable(cacheKey: string, savedAt: number, now: number = Date.now()): boolean {
  if (!Number.isFinite(savedAt) || !Number.isFinite(now) || savedAt <= 0) return false;
  if (savedAt > now + CACHE_CLOCK_SKEW_TOLERANCE_MS) return false;
  return now - savedAt <= maxCacheAgeForKey(cacheKey);
}

/**
 * Keep the newest cache records while respecting both the row and byte budgets.
 * A single pass is sufficient even when rows have highly uneven sizes.
 */
export function planPublicCacheEviction(
  entries: ReadonlyArray<{ cacheKey: string; savedAt: number; sizeBytes: number }>,
  limits: { maxEntries?: number; maxBytes?: number } = {},
): string[] {
  const maxEntries = typeof limits.maxEntries === 'number' && Number.isInteger(limits.maxEntries) && limits.maxEntries >= 0
    ? limits.maxEntries : MAX_PUBLIC_CACHE_ENTRIES;
  const maxBytes = typeof limits.maxBytes === 'number' && Number.isFinite(limits.maxBytes) && limits.maxBytes >= 0
    ? limits.maxBytes : MAX_PUBLIC_CACHE_BYTES;

  const sorted = [...entries].sort((a, b) =>
    (b.savedAt - a.savedAt) || String(a.cacheKey).localeCompare(String(b.cacheKey)),
  );
  const evicted: string[] = [];
  let keptEntries = 0;
  let keptBytes = 0;

  for (const entry of sorted) {
    const sizeBytes = Number.isFinite(entry.sizeBytes) ? Math.max(0, entry.sizeBytes) : 0;
    if (keptEntries < maxEntries && keptBytes + sizeBytes <= maxBytes) {
      keptEntries += 1;
      keptBytes += sizeBytes;
    } else {
      evicted.push(entry.cacheKey);
    }
  }
  return evicted;
}
