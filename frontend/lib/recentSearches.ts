/**
 * Recent + ranked search queries (localStorage).
 * PHASE-3: frequency-aware ranking so repeated queries surface first.
 */

const STORAGE_KEY = 'marketplat:recent-searches-v2';
const LEGACY_KEY = 'marketplat:recent-searches';
const MAX_ITEMS = 12;

export interface RecentSearchEntry {
  query: string;
  count: number;
  lastUsedAt: string;
}

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readEntries(): RecentSearchEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter(
            (x): x is RecentSearchEntry =>
              !!x &&
              typeof x === 'object' &&
              typeof (x as RecentSearchEntry).query === 'string' &&
              (x as RecentSearchEntry).query.trim().length > 0,
          )
          .map((x) => ({
            query: x.query.trim(),
            count: typeof x.count === 'number' && x.count > 0 ? x.count : 1,
            lastUsedAt: typeof x.lastUsedAt === 'string' ? x.lastUsedAt : new Date().toISOString(),
          }));
      }
    }
    // migrate legacy string[] once
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const arr = JSON.parse(legacy) as unknown;
      if (Array.isArray(arr)) {
        const migrated: RecentSearchEntry[] = arr
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((q) => ({
            query: q.trim(),
            count: 1,
            lastUsedAt: new Date().toISOString(),
          }));
        writeEntries(migrated);
        return migrated;
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

function writeEntries(entries: RecentSearchEntry[]): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ITEMS)));
  } catch {
    /* quota */
  }
}

/** Score: recency + frequency (higher = better). */
function score(e: RecentSearchEntry, now = Date.now()): number {
  const ageHours = Math.max(0, (now - Date.parse(e.lastUsedAt || '')) / 3_600_000);
  const recency = Math.max(0, 48 - ageHours); // decays over ~2 days
  return e.count * 10 + recency;
}

/** Ordered query strings for UI chips (backward compatible). */
export function getRecentSearches(): string[] {
  const now = Date.now();
  return readEntries()
    .slice()
    .sort((a, b) => score(b, now) - score(a, now))
    .map((e) => e.query)
    .slice(0, 8);
}

/** Full ranked entries (for richer UI). */
export function getRankedRecentSearches(): RecentSearchEntry[] {
  const now = Date.now();
  return readEntries()
    .slice()
    .sort((a, b) => score(b, now) - score(a, now))
    .slice(0, 8);
}

/**
 * Prefix suggestions while typing — ranked by local history.
 */
export function suggestRecentSearches(prefix: string, limit = 5): string[] {
  const p = prefix.trim().toLowerCase();
  if (p.length < 1) return getRecentSearches().slice(0, limit);
  const now = Date.now();
  return readEntries()
    .filter((e) => e.query.toLowerCase().includes(p))
    .sort((a, b) => score(b, now) - score(a, now))
    .map((e) => e.query)
    .slice(0, limit);
}

export function addRecentSearch(query: string): void {
  if (!canUseStorage()) return;
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  const now = new Date().toISOString();
  const prev = readEntries();
  const existing = prev.find((e) => e.query.toLowerCase() === trimmed.toLowerCase());
  const rest = prev.filter((e) => e.query.toLowerCase() !== trimmed.toLowerCase());
  const next: RecentSearchEntry = existing
    ? { query: trimmed, count: existing.count + 1, lastUsedAt: now }
    : { query: trimmed, count: 1, lastUsedAt: now };
  writeEntries([next, ...rest]);
}

export function clearRecentSearches(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}
