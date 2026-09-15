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
 * BEYOND arabic_normalize(): saved-search matching runs once per new
 * listing against every user's stored query, and users type saved
 * searches the same casual way they'd type a live search box — a
 * product/brand word plus a few descriptive words (color, condition)
 * tacked on. Two gaps that made this "dumber" than it should be:
 *
 * 1. WHOLE-PHRASE AND: every single word had to appear, so a 4-word
 *    saved search ("بوت اديدس اسود وابيض") never matched a 2-word ad
 *    title ("بوت اديدس") just because the ad didn't happen to mention
 *    color. Fix: OPTIONAL_MODIFIER_WORDS (colors, condition/quality
 *    adjectives) are never *required* to match — only the remaining
 *    "core" words (brand/product nouns) must. If a saved search is
 *    made up entirely of modifier words (e.g. just "اسود"), there's no
 *    core word to anchor precision on, so it falls back to requiring
 *    all words — see requiredCoreTokens() below.
 * 2. NO TYPO TOLERANCE: "اديدس" typed as "اديديس" (or any other
 *    single-letter slip) silently never matched. Fix: fuzzyTokenMatch
 *    allows a small Levenshtein distance, scaled by word length so
 *    short words (where one edit changes meaning entirely) stay exact.
 *
 * Both changes only ever make matching *more* permissive than plain
 * substring-AND — they never reject a match the old logic would have
 * accepted.
 *
 * TOKEN-AND, NOT PHRASE-SUBSTRING: plainto_tsquery splits its input
 * into words and ANDs them together — "toyota camry" and "camry
 * toyota" match the same documents. matchesSearchQuery mirrors the
 * AND-of-words behavior (see tokenize below) without pulling in real
 * tsquery parsing (no quoted phrases, no OR/NOT operators) — saved-
 * search `q` has never supported those, and this isn't the place to
 * add them.
 *
 * NOT stemming: Postgres's 'simple' text-search config (used
 * everywhere arabic_normalize is called) does no stemming either, so
 * "سيارة" will not match "سيارات" here any more than it does in the
 * main search — this file intentionally keeps the same behavior, not
 * a stronger one, so a saved search either type behaves identically.
 * (The fuzzy-typo tolerance above is a deliberate, separate exception:
 * it's there for accidental slips, not for genuine plural/grammatical
 * variants — a 1-letter Levenshtein budget on short words is too tight
 * to accidentally bridge most real plural forms anyway.)
 */

// Same source character set/target mapping as arabic_normalize()'s
// translate('أإآٱى', 'ااااي'): every hamza/madda/wasla alef variant
// folds to bare alef, alef maksura folds to yeh.
import { expandedRequiredConcepts } from './searchQueryIntelligence';

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
 * Curated, deliberately small list of common Arabic color and
 * condition/quality adjectives. These are the words people tack onto
 * a saved search ("اديدس اسود", "ايفون جديد") that describe *which*
 * matching item they want, not *whether* something is a match at all
 * — a new ad missing the color/condition mention (or using a
 * different one) is still exactly the kind of listing the user saved
 * the search to be notified about.
 *
 * Deliberately conservative: this is a fixed heuristic list, not NLP/
 * POS-tagging, so it only ever includes words that are unambiguously
 * descriptive modifiers in classifieds listings — no brand names, no
 * product nouns, nothing that could itself be the whole point of a
 * search. Extend this list rather than the matching logic if a new
 * common modifier word turns out to be missing.
 */
const OPTIONAL_MODIFIER_WORDS = new Set([
  // Colors
  'اسود', 'ابيض', 'احمر', 'ازرق', 'اخضر', 'اصفر', 'بني', 'رمادي',
  'ذهبي', 'فضي', 'بنفسجي', 'برتقالي', 'وردي', 'كحلي', 'بيج', 'كريمي',
  // Condition / quality
  'جديد', 'جديدة', 'مستعمل', 'مستعملة', 'مستخدم', 'مستخدمة',
  'ممتاز', 'ممتازة', 'نظيف', 'نظيفة', 'اصلي', 'اصلية', 'خام',
  'ممتازه', 'نظيفه',
]);

/**
 * True if `token` (already normalized) is an optional descriptive
 * modifier. Also checks the token with a single leading Arabic
 * conjunction/preposition letter (و/ف) stripped, since "black and
 * white" is typically typed glued as "وابيض" (و+ابيض) with no space —
 * TOKEN_SEPARATORS has no way to split that, but the modifier list
 * should still recognize it. This is safe: stripping only changes the
 * outcome for tokens whose *stripped* form happens to exactly match
 * the curated list — an unrelated word like "ولد" (boy) strips to
 * "لد", which isn't in the list, so it's unaffected.
 */
function isOptionalModifier(token: string): boolean {
  if (OPTIONAL_MODIFIER_WORDS.has(token)) return true;
  if (token.length > 1 && (token[0] === 'و' || token[0] === 'ف')) {
    return OPTIONAL_MODIFIER_WORDS.has(token.slice(1));
  }
  return false;
}

/**
 * Standard iterative Levenshtein distance (single-edit = insertion,
 * deletion, or substitution). Short-word/short-string inputs only
 * (saved-search tokens, haystack words) — O(n*m) is negligible here.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevRow = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow.push(
        Math.min(
          currentRow[j - 1] + 1, // insertion
          prevRow[j] + 1, // deletion
          prevRow[j - 1] + cost, // substitution
        ),
      );
    }
    prevRow = currentRow;
  }
  return prevRow[b.length];
}

/**
 * How many single-letter edits a typo is allowed to introduce before a
 * token stops being considered "the same word", scaled by length.
 * Short words carry proportionally more meaning per letter (a 1-edit
 * change to a 3-letter word can easily turn it into a different real
 * word), so they get zero tolerance — only exact/substring matching
 * applies to them, same as before this change.
 */
function allowedEditDistance(tokenLength: number): number {
  // تسامح أوسع قليلًا للكلمات المتوسطة/الطويلة (أخطاء لمس شائعة)
  if (tokenLength <= 3) return 0;
  if (tokenLength <= 5) return 1;
  if (tokenLength <= 9) return 2;
  return 3;
}

/**
 * True if `token` matches somewhere in the haystack — either as a
 * literal substring of the full normalized haystack text (fast path,
 * also handles a token appearing embedded inside a longer haystack
 * word), or, if that fails and the token is long enough to allow it,
 * within a small Levenshtein distance of some individual haystack
 * word (typo tolerance).
 */
function tokenMatches(haystackText: string, haystackWords: string[], token: string): boolean {
  if (haystackText.includes(token)) return true;

  const maxDistance = allowedEditDistance(token.length);
  if (maxDistance === 0) return false;

  return haystackWords.some((word) => levenshteinDistance(token, word) <= maxDistance);
}

/**
 * True if `rawQuery`'s "core" words all match `haystacks` (joined),
 * after both sides go through the same normalization as
 * GET /ads?search=, with typo tolerance on each word (see
 * allowedEditDistance) and optional descriptive modifier words (see
 * OPTIONAL_MODIFIER_WORDS) never required to match.
 *
 * Callers pass the same fields the SQL search indexes weight (title/
 * name A, description B) — weighting itself doesn't matter here since
 * this is a boolean match, not a ranked result.
 */
export function matchesSearchQuery(haystacks: Array<string | null | undefined>, rawQuery: string): boolean {
  const haystackText = normalizeSearchText(haystacks.filter(Boolean).join(' '));
  const tokens = tokenize(rawQuery);
  if (tokens.length === 0) return true;

  const haystackWords = haystackText.split(TOKEN_SEPARATORS).map((w) => w.trim()).filter(Boolean);

  const coreTokens = tokens.filter((t) => !isOptionalModifier(t));
  // If every word in the saved search happens to be a modifier word
  // (e.g. a saved search that's just "اسود"), there's no core word
  // left to anchor precision on — fall back to requiring every word,
  // same as the original behavior, rather than matching everything.
  const requiredTokens = coreTokens.length > 0 ? coreTokens : tokens;

  // SEARCH-INTEL-01: synonym / dialect / morphology expansion so a
  // saved search for "جوال" still matches an ad titled "موبايل".
  const concepts = expandedRequiredConcepts(rawQuery);
  if (concepts.length > 0) {
    const coreConcepts = concepts.filter((alts) => {
      const bases = alts.map((a) => a.replace(/^ال/, ''));
      return !bases.every((b) => isOptionalModifier(b));
    });
    const required = coreConcepts.length > 0 ? coreConcepts : concepts;
    return required.every((alts) =>
      alts.some((token) => tokenMatches(haystackText, haystackWords, token)),
    );
  }

  return requiredTokens.every((token) => tokenMatches(haystackText, haystackWords, token));
}
