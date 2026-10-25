-- AlterTable
-- Baseline column for the weekly ad-views-report job: stores each ad's
-- `views` value as of the last WEEKLY_AD_VIEWS_REPORT notification, so
-- the job can compute a per-run delta instead of re-reporting the same
-- lifetime total every week. Defaults to 0 for existing rows, meaning
-- their entire current view count counts as "new" the first time the
-- job runs after this migration.
ALTER TABLE "ads" ADD COLUMN "viewsAtLastReport" INTEGER NOT NULL DEFAULT 0;
