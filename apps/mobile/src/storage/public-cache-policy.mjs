/**
 * Public-cache policy shared by the SQLite adapter and dependency-free Node tests.
 * Explicitly saved-offline resources live in their own table and are not expired here.
 */
export const MAX_PUBLIC_CACHE_ENTRIES = 100;
export const MAX_PUBLIC_CACHE_BYTES = 6_000_000;
export const PUBLIC_CACHE_MAX_STALE_MS = 7 * 24 * 60 * 60 * 1_000;
export const PRIVATE_CACHE_MAX_STALE_MS = 24 * 60 * 60 * 1_000;
export const CACHE_CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1_000;

export function maxCacheAgeForKey(cacheKey) {
  return typeof cacheKey === 'string' && cacheKey.startsWith('api-private:')
    ? PRIVATE_CACHE_MAX_STALE_MS
    : PUBLIC_CACHE_MAX_STALE_MS;
}

export function isPublicCacheEntryUsable(cacheKey, savedAt, now = Date.now()) {
  if (!Number.isFinite(savedAt) || !Number.isFinite(now) || savedAt <= 0) return false;
  if (savedAt > now + CACHE_CLOCK_SKEW_TOLERANCE_MS) return false;
  return now - savedAt <= maxCacheAgeForKey(cacheKey);
}

/**
 * Keep the newest cache records while respecting both the row and byte budgets.
 * A single pass is sufficient even when rows have highly uneven sizes.
 */
export function planPublicCacheEviction(entries, limits = {}) {
  const maxEntries = Number.isInteger(limits.maxEntries) && limits.maxEntries >= 0
    ? limits.maxEntries : MAX_PUBLIC_CACHE_ENTRIES;
  const maxBytes = Number.isFinite(limits.maxBytes) && limits.maxBytes >= 0
    ? limits.maxBytes : MAX_PUBLIC_CACHE_BYTES;

  const sorted = [...entries].sort((a, b) =>
    (b.savedAt - a.savedAt) || String(a.cacheKey).localeCompare(String(b.cacheKey)),
  );
  const evicted = [];
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
