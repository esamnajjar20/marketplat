/**
 * JS-side counterpart to the `arabic_normalize()` Postgres function
 * (prisma/migrations/20260805212538_arabic_search_normalization). That
 * migration is what makes GET /ads?search=, GET /products?search=,
 * search.repository.ts, etc. "smart" — letter-shape-insensitive,
 * diacritic-insensitive, word-order-insensitive full-text matching via
 * to_tsvector/plainto_tsquery. Saved-search matching (this module) runs
 * in Node against every stored SavedSearch row for one newly created
 * ad/product/listing, not as a DB query — so it can't call the SQL
 * function directly. This file exists so it doesn't have to fall back
 * to naive `.includes()` (literal, order-sensitive, letter-shape-
 * sensitive) instead.
 *
 * SAME EQUIVALENCE CLASSES, ON PURPOSE: this folds exactly the
 * characters arabic_normalize() folds (أإآٱى → ا/ي), strips exactly
 * what it strips (tatweel + tashkeel), and deliberately leaves ة/ه
 * un-folded for the same reason given in the migration's own comment —
 * that pair changes a word's meaning often enough that folding them
 * would trade a smaller precision loss for a larger one. If the SQL
 * function's equivalence classes ever change, update this in lockstep
 * or saved-search matching will silently drift from what GET /ads
 * ?search= considers a match.
 *
 * TOKEN-AND, NOT PHRASE-SUBSTRING: plainto_tsquery splits its input
 * into words and ANDs them together — "toyota camry" and "camry
 * toyota" match the same documents. The previous saved-search
 * matching did `haystack.includes(wholeQueryString)`, so a 2-word
 * saved search only ever matched a listing where those two words
 * appeared adjacent and in that exact order — arguably the single
 * biggest source of "why didn't my saved search notify me" for any
 * multi-word saved search. matchesSearchQuery mirrors the AND-of-words
 * behavior (see tokenize below) without pulling in real tsquery
 * parsing (no quoted phrases, no OR/NOT operators) — saved-search `q`
 * has never supported those, and this isn't the place to add them.
 *
 * NOT stemming: Postgres's 'simple' text-search config (used
 * everywhere arabic_normalize is called) does no stemming either, so
 * "سيارة" will not match "سيارات" here any more than it does in the
 * main search — this file intentionally keeps the same behavior, not
 * a stronger one, so a saved search either type behaves identically.
 */

// Same source character set/target mapping as arabic_normalize()'s
// translate('أإآٱى', 'ااااي'): every hamza/madda/wasla alef variant
// folds to bare alef, alef maksura folds to yeh.
const ALEF_VARIANTS = /[أإآٱ]/g;
const ALEF_MAKSURA = /ى/g;

// Same character class as the migration's regexp_replace pattern:
// tatweel (U+0640) plus the eight combining tashkeel marks
// (U+064B–U+0652), stripped rather than folded.
const TATWEEL_AND_TASHKEEL = /[\u0640\u064B-\u0652]/g;

/** Mirrors arabic_normalize(text) — see file header for why this must
 * stay in lockstep with the SQL function of the same name. */
export function normalizeSearchText(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(ALEF_VARIANTS, 'ا')
    .replace(ALEF_MAKSURA, 'ي')
    .replace(TATWEEL_AND_TASHKEEL, '')
    .toLowerCase();
}

// Splits on whitespace plus the Arabic/Latin punctuation a saved-search
// query is realistically typed with (commas, Arabic comma ،, Arabic
// semicolon ؛, slashes) — not full tokenization, just enough that
// "toyota, camry" and "toyota camry" tokenize the same way.
const TOKEN_SEPARATORS = /[\s,،؛;/\\|]+/;

function tokenize(query: string): string[] {
  return normalizeSearchText(query)
    .split(TOKEN_SEPARATORS)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * True if every word in `rawQuery` appears somewhere in `haystacks`
 * (joined), after both sides go through the same normalization as
 * GET /ads?search=. AND semantics across words, substring (not
 * whole-word-boundary) match per word — see file header for why.
 *
 * Callers pass the same fields the SQL search indexes weight (title/
 * name A, description B) — weighting itself doesn't matter here since
 * this is a boolean match, not a ranked result.
 */
export function matchesSearchQuery(haystacks: Array<string | null | undefined>, rawQuery: string): boolean {
  const haystack = normalizeSearchText(haystacks.filter(Boolean).join(' '));
  const tokens = tokenize(rawQuery);
  if (tokens.length === 0) return true;
  return tokens.every((token) => haystack.includes(token));
}
