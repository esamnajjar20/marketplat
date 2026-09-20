/**
 * Recent + ranked search queries (localStorage).
 * PHASE-3: frequency-aware ranking so repeated queries surface first.
 */

import { arabicNormalize } from './arabicNormalize';

const STORAGE_KEY = 'marketplat:recent-searches-v2';
const LEGACY_KEY = 'marketplat:recent-searches';
const MAX_ITEMS = 12;
// FIX RECENT-SEARCHES-COUNT-CAP-01: cap on per-query frequency. See
// addRecentSearch's own comment for the score-dominance reasoning.
const MAX_COUNT = 20;

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
 * Substring suggestions while typing — ranked by local history.
 *
 * FIX RECENT-SEARCHES-SUGGEST-01: documented as "prefix
 * suggestions" but implemented with .includes() — a substring
 * match, not prefix. The implementation is right for Arabic (a
 * user typing "ار" should see "سيارة"); the comment was wrong.
 * Also normalizes both sides via arabicNormalize so a history
 * entry stored as "سيارة" matches a typed "سياره" and vice versa.
 */
export function suggestRecentSearches(prefix: string, limit = 5): string[] {
  const p = arabicNormalize(prefix);
  if (p.length < 1) return getRecentSearches().slice(0, limit);
  const now = Date.now();
  return readEntries()
    .filter((e) => arabicNormalize(e.query).includes(p))
    .sort((a, b) => score(b, now) - score(a, now))
    .map((e) => e.query)
    .slice(0, limit);
}

export function addRecentSearch(query: string): void {
  if (!canUseStorage()) return;
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  const now = new Date().toISOString();
  // FIX RECENT-SEARCHES-ARABIC-01: use arabicNormalize for lookup and
  // dedup, not raw toLowerCase. "سيارة" and "سياره" are now one
  // entry instead of two near-duplicates, matching how the search
  // itself treats them as the same query.
  const normalizedTrimmed = arabicNormalize(trimmed);
  const prev = readEntries();
  const existing = prev.find((e) => arabicNormalize(e.query) === normalizedTrimmed);
  const rest = prev.filter((e) => arabicNormalize(e.query) !== normalizedTrimmed);
  // FIX RECENT-SEARCHES-COUNT-CAP-01: without a cap, a query used
  // daily for a month (count=30, score=348) permanently outranked
  // every fresh query (count=1, score=58) for the ~2-day recency-
  // decay window, then stayed dominant even longer because score
  // is linear in count. Capped at 20 the score saturates at 248 —
  // the top of the list stays responsive to what the user is
  // searching for lately.
  const next: RecentSearchEntry = existing
    ? { query: trimmed, count: Math.min(existing.count + 1, MAX_COUNT), lastUsedAt: now }
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
