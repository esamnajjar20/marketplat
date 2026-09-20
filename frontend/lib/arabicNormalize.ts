/**
 * FIX ARABIC-NORMALIZE-CLIENT-01: client-side counterpart of the
 * backend's arabic_normalize() Postgres function
 * (backend/prisma/migrations/20260805212538_arabic_search_normalization)
 * and of searchTextMatch.ts's normalizeSearchText on the server.
 *
 * The full-text search path (backend search.repository.ts) applies
 * arabic_normalize on BOTH the indexed columns and the incoming query
 * term, so a user typing "سياره" finds listings stored with the
 * canonical "سيارة" and vice versa. Before this file existed, the
 * client had no equivalent — offlineSearchIndex.ts's local search
 * compared lowercased strings with .includes(), so a user searching
 * "سياره" while offline found nothing, while the exact same query
 * online returned results. Same word, same user, different results
 * depending on connectivity: exactly the kind of inconsistency that
 * makes an offline-capable app feel broken.
 *
 * Also used by recentSearches.ts so "سيارة" and "سياره" collapse into
 * one history entry instead of two near-duplicates, and so a history
 * lookup while typing matches regardless of which variant the user
 * typed on a previous visit.
 *
 * Scope intentionally matches the SQL function exactly:
 *   - alef variants (أ إ آ ٱ) -> bare alef
 *   - alef maksura (ى) -> yeh (ي)
 *   - tatweel (U+0640) and the eight tashkeel marks (U+064B-U+0652) stripped
 *   - NOT folded: ta marbuta (ة) <-> ha (ه) — see the migration's own
 *     comment for why; the pair changes gender/meaning too often to
 *     trade precision for a match
 *   - NOT folded: Arabic-Indic digits (٠-٩) -> Latin (0-9). The SQL
 *     function does not do this either. Adding it here would make the
 *     client match strings the server never would — a client-only
 *     augmentation, not a parity fix.
 *
 * Zero dependencies. Safe to call on undefined/null (returns '').
 */
export interface ArabicNormalizeOptions {
  /**
   * When false, skip the final toLowerCase(). Set this for call sites
   * that persist the result for *display* (URL q params, form values)
   * while still wanting the Arabic fold (alef/yeh/tatweel/tashkeel).
   * Matching paths (offlineSearchIndex, recentSearches dedup) should
   * leave this default (true) for parity with the SQL function, which
   * also lowercases.
   */
  lowercase?: boolean;
}

export function arabicNormalize(
  input: string | null | undefined,
  opts?: ArabicNormalizeOptions,
): string {
  if (!input) return '';
  const folded = input
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[\u0640\u064B-\u0652]/g, '');
  return opts?.lowercase === false ? folded : folded.toLowerCase();
}

/** Convenience: arabicNormalize then trim. */
export function arabicNormalizeTrimmed(input: string | null | undefined): string {
  return arabicNormalize(input).trim();
}
