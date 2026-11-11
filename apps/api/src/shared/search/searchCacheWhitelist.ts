const SEARCH_TERM_PATTERN = /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+){0,2}$/u;

/** Normalize an analytics search term exactly once before review/export. */
export function normalizeSearchCacheTerm(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/**
 * Keep only short, human-readable public search phrases. This is a privacy
 * hygiene filter, not an automatic guarantee that a phrase contains no name;
 * exported candidates must still be manually reviewed before deployment.
 */
export function isSearchCacheWhitelistCandidate(value: string): boolean {
  const term = normalizeSearchCacheTerm(value);
  if (term.length < 2 || term.length > 40) return false;
  if (!SEARCH_TERM_PATTERN.test(term)) return false;
  const words = term.split(' ');
  return words.length <= 3 && words.every(word => word.length >= 2);
}
