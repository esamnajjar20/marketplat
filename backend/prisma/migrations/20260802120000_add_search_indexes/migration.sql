-- Unified search module: GIN full-text indexes.
--
-- Mirrors ads.repository.ts's existing full-text search expression
-- exactly (setweight + coalesce, title/name weighted 'A', description
-- weighted 'B') — an index only gets used by the planner when its
-- expression matches the query's expression verbatim, so these must
-- stay byte-for-byte identical to what search.repository.ts (and
-- ads.repository.ts for the ads table) actually queries with.
--
-- coalesce(...) guards against NULL short-circuiting the whole
-- tsvector to NULL (silently dropping the row from the index) on any
-- column that's nullable — description is NOT NULL on every one of
-- these tables today, but the guard costs nothing and protects against
-- a future nullable column silently breaking the index.

-- ads: was previously un-indexed (to_tsvector computed inline on every
-- query in ads.repository.ts's raw-SQL search branch) — this index now
-- lets the planner use it instead of a full sequential scan.
CREATE INDEX IF NOT EXISTS "ads_search_idx" ON "ads" USING GIN (
  (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'B')
  )
);

CREATE INDEX IF NOT EXISTS "products_search_idx" ON "products" USING GIN (
  (
    setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'B')
  )
);

CREATE INDEX IF NOT EXISTS "store_details_search_idx" ON "store_details" USING GIN (
  (
    setweight(to_tsvector('simple', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'B')
  )
);

CREATE INDEX IF NOT EXISTS "service_listings_search_idx" ON "service_listings" USING GIN (
  (
    setweight(to_tsvector('simple', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('simple', coalesce("description", '')), 'B')
  )
);
