-- FEAT-REPORT-USER-STORE: Report was hard-wired to Ad only (required
-- adId FK, @@unique([adId, userId])) — there was no way to report a
-- user's profile or a store, only an ad. This migration converts it to
-- the same polymorphic shape "user_activities" already uses for
-- entityType/entityId: a ReportTargetType enum + a plain targetId
-- string with no FK, so a reported user/store/ad can later be deleted
-- without orphaning the report row the admin queue still needs to show.
--
-- adId is kept (made nullable) rather than dropped, and every existing
-- row is backfilled to targetType='AD', targetId=adId — this is a
-- lossless rename/copy, not a destructive rewrite. New USER/STORE
-- reports will have adId = NULL.

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('AD', 'USER', 'STORE');

-- AlterTable: add the new nullable columns first
ALTER TABLE "reports" ADD COLUMN "targetType" "ReportTargetType";
ALTER TABLE "reports" ADD COLUMN "targetId" TEXT;

-- Backfill: every pre-existing row was implicitly an AD report
UPDATE "reports" SET "targetType" = 'AD', "targetId" = "adId";

-- Now that every row has a value, enforce NOT NULL going forward
ALTER TABLE "reports" ALTER COLUMN "targetType" SET NOT NULL;
ALTER TABLE "reports" ALTER COLUMN "targetId" SET NOT NULL;

-- adId becomes optional: only AD-target reports populate it now
ALTER TABLE "reports" ALTER COLUMN "adId" DROP NOT NULL;

-- Drop the old AD-only unique constraint and FK, replaced by a
-- polymorphic-aware unique constraint below
DROP INDEX IF EXISTS "reports_adId_userId_key";
ALTER TABLE "reports" DROP CONSTRAINT IF EXISTS "reports_adId_fkey";

-- Re-add the Ad FK as optional (ON DELETE CASCADE unchanged: if the
-- underlying ad is hard-deleted, its AD-type reports go with it, same
-- as before this migration)
ALTER TABLE "reports" ADD CONSTRAINT "reports_adId_fkey" FOREIGN KEY ("adId") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE UNIQUE INDEX "reports_targetType_targetId_userId_key" ON "reports"("targetType", "targetId", "userId");

-- CreateIndex
CREATE INDEX "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");
