-- Rebuildable autocomplete projection. The main full-text search path keeps
-- using PostgreSQL's existing GIN expression indexes on ads/products/stores/
-- services; those indexes are maintained transactionally by PostgreSQL and
-- do not need a second Go-owned copy. This view accelerates the four-source
-- prefix suggestion lookup only.
--
-- WITH NO DATA keeps deployment/migration time bounded on large catalogs.
-- Until Go performs the initial refresh, the API uses the existing live-query
-- implementation. The first Go refresh uses non-CONCURRENTLY mode; later
-- refreshes use CONCURRENTLY while readers continue seeing the old snapshot.
CREATE MATERIALIZED VIEW "search_suggestions_mv" AS
SELECT
  'product'::TEXT AS "sourceType",
  1::SMALLINT AS "sourcePriority",
  source."displayValue",
  lower(arabic_normalize(source."displayValue")) AS "normalizedValue"
FROM (
  SELECT DISTINCT "name" AS "displayValue"
  FROM "products"
  WHERE "status" = 'ACTIVE'
) AS source
UNION ALL
SELECT
  'store'::TEXT AS "sourceType",
  2::SMALLINT AS "sourcePriority",
  source."displayValue",
  lower(arabic_normalize(source."displayValue")) AS "normalizedValue"
FROM (
  SELECT DISTINCT "name" AS "displayValue"
  FROM "store_details"
  WHERE "status" = 'ACTIVE'
) AS source
UNION ALL
SELECT
  'product_category'::TEXT AS "sourceType",
  3::SMALLINT AS "sourcePriority",
  source."displayValue",
  lower(arabic_normalize(source."displayValue")) AS "normalizedValue"
FROM (
  SELECT DISTINCT "nameAr" AS "displayValue"
  FROM "product_categories"
  WHERE "isActive" = TRUE
) AS source
UNION ALL
SELECT
  'service_category'::TEXT AS "sourceType",
  4::SMALLINT AS "sourcePriority",
  source."displayValue",
  lower(arabic_normalize(source."displayValue")) AS "normalizedValue"
FROM (
  SELECT DISTINCT "nameAr" AS "displayValue"
  FROM "service_categories"
  WHERE "isActive" = TRUE
) AS source
WITH NO DATA;

-- Required by REFRESH MATERIALIZED VIEW CONCURRENTLY. The sourceType keeps
-- identical display values from separate source classes independently
-- addressable while the API de-duplicates them in source-priority order.
CREATE UNIQUE INDEX "search_suggestions_mv_source_display_key"
  ON "search_suggestions_mv" ("sourceType", "displayValue");

-- B-tree pattern-ops index makes normalized prefix LIKE queries indexable.
CREATE INDEX "search_suggestions_mv_prefix_idx"
  ON "search_suggestions_mv" ("normalizedValue" text_pattern_ops, "sourcePriority", "displayValue");

CREATE TABLE "search_suggestion_index_state" (
  "singletonId" SMALLINT NOT NULL DEFAULT 1,
  "refreshedAt" TIMESTAMPTZ,
  "indexedRows" BIGINT NOT NULL DEFAULT 0,
  "lastDurationMs" INTEGER,
  "lastError" VARCHAR(1000),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_suggestion_index_state_pkey" PRIMARY KEY ("singletonId"),
  CONSTRAINT "search_suggestion_index_state_singleton_check" CHECK ("singletonId" = 1),
  CONSTRAINT "search_suggestion_index_state_indexed_rows_check" CHECK ("indexedRows" >= 0),
  CONSTRAINT "search_suggestion_index_state_duration_check" CHECK ("lastDurationMs" IS NULL OR "lastDurationMs" >= 0)
);

INSERT INTO "search_suggestion_index_state" ("singletonId", "updatedAt")
VALUES (1, CURRENT_TIMESTAMP);

COMMENT ON MATERIALIZED VIEW "search_suggestions_mv" IS
  'Rebuildable normalized autocomplete suggestions for active products, stores, product categories, and service categories; refreshed by the Go Search Index Engine.';
COMMENT ON TABLE "search_suggestion_index_state" IS
  'Singleton freshness/status ledger for the rebuildable search suggestion materialized view. Stale or missing state causes the API to use live source queries.';
