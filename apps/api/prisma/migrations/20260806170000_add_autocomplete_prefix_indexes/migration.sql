-- AUDIT-FIX 1.2: search.repository.ts's suggest() (autocomplete) filters
-- with `arabic_normalize("col") ILIKE arabic_normalize(prefix) ESCAPE '!'`
-- against products.name, store_details.name, product_categories.nameAr,
-- and service_categories.nameAr. Despite the pattern being prefix-only
-- (`${escapedPrefix}%`, no leading '%' — see that function's comments),
-- there was no index at all on arabic_normalize(column), so Postgres had
-- to evaluate the function on every row of every call: a full table scan
-- per keystroke, on every one of these four tables.
--
-- Two things had to both be fixed, not just one:
--
--  1. No index existed on arabic_normalize(column) — added below, as a
--     plain B-tree using text_pattern_ops. GIN full-text indexes already
--     exist for ads/products/store_details (see the
--     arabic_search_normalization migration), but those match tsvector
--     @@ tsquery, not a LIKE 'prefix%' pattern — a different index type
--     is required for prefix matching. text_pattern_ops specifically
--     (not the default btree opclass) is required for LIKE/~~ to use a
--     btree index at all under any locale other than "C" — see Postgres
--     docs on operator classes for pattern matching.
--
--  2. ILIKE itself defeats a text_pattern_ops index even once one
--     exists: the planner only matches a btree pattern-ops index against
--     the plain `~~` (LIKE) operator, not `~~*` (ILIKE) — ILIKE compiles
--     to a different, case-insensitive operator that pattern_ops does
--     not support. The query-side fix (search.repository.ts) replaces
--     ILIKE with an explicit `lower(...) LIKE lower(...)`, matching an
--     index built on lower(arabic_normalize(column)) below. This is
--     equivalent to the previous ILIKE for these columns — none of
--     name/nameAr use case-sensitive collation semantics anywhere else
--     in this codebase — while actually being indexable.
--
-- IMMUTABLE requirement: arabic_normalize() is already IMMUTABLE (see
-- arabic_search_normalization migration); lower() on text is IMMUTABLE
-- under any Postgres-supported locale, so lower(arabic_normalize(x)) is
-- safe to index.

CREATE INDEX IF NOT EXISTS "products_name_prefix_idx"
  ON "products" (lower(arabic_normalize("name")) text_pattern_ops)
  WHERE "status" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS "store_details_name_prefix_idx"
  ON "store_details" (lower(arabic_normalize("name")) text_pattern_ops)
  WHERE "status" = 'ACTIVE';

CREATE INDEX IF NOT EXISTS "product_categories_name_ar_prefix_idx"
  ON "product_categories" (lower(arabic_normalize("nameAr")) text_pattern_ops)
  WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS "service_categories_name_ar_prefix_idx"
  ON "service_categories" (lower(arabic_normalize("nameAr")) text_pattern_ops)
  WHERE "isActive" = true;
