-- FIX SEARCH-AR-01: Arabic full-text search had zero letter-shape
-- normalization. Every to_tsvector/plainto_tsquery call used Postgres's
-- 'simple' text-search configuration, which does no stemming and — more
-- importantly for Arabic — does not treat common letter-shape variants
-- as equivalent. In everyday Arabic typing, these are effectively
-- interchangeable and a search that doesn't unify them silently misses
-- matches a human would consider obviously correct:
--
--   - Alef variants: أ (hamza-above) / إ (hamza-below) / آ (madda) /
--     ٱ (wasla) are routinely typed as bare ا, and vice versa. A
--     listing titled "السيارة" (with plain alef) would not match a
--     search for "ﻷسيارة" typed with hamza, or the reverse — depending
--     entirely on which variant the original author happened to type.
--   - ى (alef maksura) vs ي (yeh): interchangeable at word-end in most
--     everyday typing (e.g. "مبنى" vs "مبني").
--   - Tatweel/kashida (ـ, U+0640): a pure justification/stretching
--     character some text editors or copy-pasted content inserts
--     mid-word — invisible to a human reader but breaks token matching
--     if left in, since "بيــت" and "بيت" would tokenize differently.
--   - Tashkeel (diacritics: fatha, damma, kasra, sukun, shadda, the
--     three tanwin marks, U+064B–U+0652): almost never typed in casual
--     Arabic, but when present (pasted from a formally-vocalized
--     source) they'd otherwise make an undiacritized search term fail
--     to match a diacritized listing.
--
-- Deliberately NOT touching ة (ta marbuta) vs ه (ha): unlike the
-- variants above, this pair changes a word's grammatical gender marker
-- and meaning often enough (e.g. مدرسة "school" vs مدره is not a real
-- alternate spelling anyone types) that folding them together would
-- trade a smaller precision loss for a larger one — this project errs
-- towards the conservative, well-established equivalence classes only.
--
-- IMMUTABLE is required for use inside a GIN expression index (Postgres
-- rejects VOLATILE/STABLE functions in an index expression since their
-- output must be reproducible from input alone) — translate() and
-- regexp_replace() with the ASCII-only 'simple' text-search config are
-- both genuinely deterministic here, so the guarantee holds.

CREATE OR REPLACE FUNCTION arabic_normalize(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT regexp_replace(
    translate(
      coalesce(input, ''),
      'أإآٱى',
      'ااااي'
    ),
    -- Strips tatweel (ـ, U+0640) and the eight combining tashkeel marks
    -- (ً ٌ ٍ َ ُ ِ ّ ْ, U+064B–U+0652) in one pass rather than one
    -- translate() per character — translate() only does 1:1 character
    -- substitution, it can't delete, so removal needs regexp_replace
    -- regardless. Written as literal characters, not \uXXXX escapes:
    -- Postgres's regex engine (a Tcl ARE, not PCRE) does not support
    -- \u Unicode escapes inside a character class the way PCRE does —
    -- the portable, engine-agnostic form is to embed the actual
    -- characters directly in the pattern string.
    '[ـًٌٍَُِّْ]',
    '',
    'g'
  );
$$;

COMMENT ON FUNCTION arabic_normalize(text) IS
  'FIX SEARCH-AR-01: folds Arabic alef/yeh letter-shape variants to one canonical form and strips tatweel + diacritics, so full-text search treats everyday typing variants as equivalent. Must stay byte-for-byte identical wherever it is used in a query vs. an index expression — see ads.repository.ts / search.repository.ts and this migration''s index definitions.';

-- Rebuild every existing search GIN index with arabic_normalize()
-- wrapped around each column before to_tsvector — DROP+CREATE rather
-- than trying to ALTER an expression index in place, since Postgres
-- has no such ALTER form for expression indexes.
DROP INDEX IF EXISTS "ads_search_idx";
CREATE INDEX "ads_search_idx" ON "ads" USING GIN (
  (
    setweight(to_tsvector('simple', arabic_normalize(coalesce("title", ''))), 'A') ||
    setweight(to_tsvector('simple', arabic_normalize(coalesce("description", ''))), 'B')
  )
);

DROP INDEX IF EXISTS "products_search_idx";
CREATE INDEX "products_search_idx" ON "products" USING GIN (
  (
    setweight(to_tsvector('simple', arabic_normalize(coalesce("name", ''))), 'A') ||
    setweight(to_tsvector('simple', arabic_normalize(coalesce("description", ''))), 'B')
  )
);

DROP INDEX IF EXISTS "store_details_search_idx";
CREATE INDEX "store_details_search_idx" ON "store_details" USING GIN (
  (
    setweight(to_tsvector('simple', arabic_normalize(coalesce("name", ''))), 'A') ||
    setweight(to_tsvector('simple', arabic_normalize(coalesce("description", ''))), 'B')
  )
);

DROP INDEX IF EXISTS "service_listings_search_idx";
CREATE INDEX "service_listings_search_idx" ON "service_listings" USING GIN (
  (
    setweight(to_tsvector('simple', arabic_normalize(coalesce("title", ''))), 'A') ||
    setweight(to_tsvector('simple', arabic_normalize(coalesce("description", ''))), 'B')
  )
);
