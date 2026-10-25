/**
 * STORE-SLUG (Foundation v1): turns a store name into a URL-safe slug.
 *
 * Deliberately keeps letters from any script (Arabic included, via the
 * unicode `\p{L}` class) instead of transliterating them away — most
 * store names on this marketplace are Arabic, and a slug like
 * "متجر-الاقصى" is still a meaningful, shareable, readable URL for this
 * audience. This mirrors product-categories' `slug` column in spirit,
 * except that one is hand-authored at seed time and this one is
 * generated at createStore time.
 */
const slugifyBase = (input: string): string =>
  input
    .trim()
    .toLowerCase()
    // Any run of characters that isn't a letter or digit collapses to
    // one hyphen (spaces, punctuation, emoji, etc.).
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

/** Base slug for a store name. Falls back to "store" for an empty/
 * all-punctuation name (e.g. "!!!") so callers never get "". */
export const generateStoreSlug = (name: string): string => {
  const base = slugifyBase(name);
  return base.length > 0 ? base : 'store';
};

/** Appends a short random suffix to resolve a slug collision — used by
 * storesService.createStore in a bounded retry loop against
 * storesRepository.findBySlug. */
export const withSlugSuffix = (base: string): string =>
  `${base}-${Math.random().toString(36).slice(2, 6)}`;
