-- STORE-SLUG / STORE-HOURS / STORE-VIEWS (Foundation v1): adds a
-- shareable slug, an optional weekly working-hours schedule (same
-- shape as service_provider_details.workingHours), and a lifetime
-- view counter (same convention as products.views) to store_details.

-- AddColumn (nullable first — slug is backfilled below, then locked
-- down to NOT NULL + UNIQUE once every existing row has one)
ALTER TABLE "store_details" ADD COLUMN "slug" TEXT;
ALTER TABLE "store_details" ADD COLUMN "workingHours" JSONB;
ALTER TABLE "store_details" ADD COLUMN "views" INTEGER NOT NULL DEFAULT 0;

-- Backfill: slugify the existing name (keep Latin/Arabic letters and
-- digits, collapse everything else to a single hyphen, trim edge
-- hyphens), then disambiguate with ROW_NUMBER() per base slug so
-- uniqueness is guaranteed by construction instead of relying on a
-- truncated id prefix (cuids minted close together can share their
-- first characters, which caused real collisions on this table).
WITH base AS (
  SELECT
    id,
    NULLIF(
      lower(
        regexp_replace(
          regexp_replace(name, '[^a-zA-Z0-9\u0600-\u06FF]+', '-', 'g'),
          '(^-+|-+$)', '', 'g'
        )
      ),
      ''
    ) AS base_slug
  FROM "store_details"
  WHERE "slug" IS NULL
),
numbered AS (
  SELECT
    id,
    COALESCE(base_slug, 'store') AS base_slug,
    ROW_NUMBER() OVER (PARTITION BY COALESCE(base_slug, 'store') ORDER BY id) AS rn
  FROM base
)
UPDATE "store_details" s
SET "slug" = CASE
  WHEN n.rn = 1 THEN n.base_slug
  ELSE n.base_slug || '-' || n.rn
END
FROM numbered n
WHERE s.id = n.id;

ALTER TABLE "store_details" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "store_details_slug_key" ON "store_details"("slug");
