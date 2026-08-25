/**
 * Recent search queries persisted in localStorage (client-only).
 * Used by SearchBox / SearchBar to surface quick re-queries.
 */

const STORAGE_KEY = 'marketplat:recent-searches';
const MAX_ITEMS = 8;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function getRecentSearches(): string[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string): void {
  if (!canUseStorage()) return;
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  try {
    const prev = getRecentSearches().filter(
      (q) => q.toLowerCase() !== trimmed.toLowerCase(),
    );
    const next = [trimmed, ...prev].slice(0, MAX_ITEMS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota / private mode — ignore
  }
}

export function clearRecentSearches(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
