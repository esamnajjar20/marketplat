-- FEAT-FAVORITE-POLYMORPHIC PR1
-- Generalizes Favorite from an AD-only FK (adId -> Ad) to the same
-- entityType+entityId, no-FK shape UserActivity/Report already use.
-- PR1 writes/reads AD only (see favorites.repository.ts) — this
-- migration just gets the schema and existing data into the new
-- shape so PR2 can turn on PRODUCT/STORE/SERVICE_LISTING without a
-- second schema change.
--
-- Two-phase, both steps in this single file since the project has no
-- production data yet (agreed in planning: no need for a separate
-- deploy-gap phase). If this were run against a live table with
-- existing Favorite rows, phase 2 (NOT NULL + drop FK) would need to
-- ship as its own migration *after* confirming phase 1's backfill via
-- a manual data check, not in the same transaction.

-- Phase 1: add new columns nullable, drop the old AD-only unique
-- constraint (userId, adId), keep the old FK/adId column as-is so
-- nothing here is destructive yet.
CREATE TYPE "FavoriteEntityType" AS ENUM ('AD', 'PRODUCT', 'SERVICE_LISTING', 'STORE');

ALTER TABLE "favorites" ADD COLUMN "entityType" "FavoriteEntityType";
ALTER TABLE "favorites" ADD COLUMN "entityId" TEXT;

-- Backfill every existing row: every Favorite today is an AD favorite.
UPDATE "favorites" SET "entityType" = 'AD', "entityId" = "adId" WHERE "entityType" IS NULL;

-- Phase 2: now that every row has entityType/entityId populated,
-- enforce NOT NULL, replace the old unique constraint with the
-- generalized one, drop the Ad FK (adId becomes a plain nullable
-- legacy column, no relation), and drop the old constraint/index that
-- referenced adId directly.
ALTER TABLE "favorites" ALTER COLUMN "entityType" SET NOT NULL;
ALTER TABLE "favorites" ALTER COLUMN "entityId" SET NOT NULL;

ALTER TABLE "favorites" DROP CONSTRAINT IF EXISTS "favorites_userId_adId_key";
ALTER TABLE "favorites" DROP CONSTRAINT IF EXISTS "favorites_adId_fkey";

ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_entityType_entityId_key"
  UNIQUE ("userId", "entityType", "entityId");

CREATE INDEX "favorites_entityType_entityId_idx" ON "favorites"("entityType", "entityId");

-- adId is deliberately NOT dropped here — see schema.prisma's Favorite
-- doc comment. It's a nullable legacy compatibility column now,
-- retained for fast rollback, to be dropped in a later migration once
-- PR1 has been live and verified.
