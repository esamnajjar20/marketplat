-- Rebuildable UTC daily aggregates for product analytics. The raw event log
-- remains authoritative; the completion ledger distinguishes a truly empty
-- day from a day that has not been rolled up yet.
CREATE TABLE "analytics_event_daily_rollups" (
  "bucketDate" DATE NOT NULL,
  "event" "AnalyticsEventType" NOT NULL,
  "categoryId" TEXT NOT NULL DEFAULT '',
  "eventCount" BIGINT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_event_daily_rollups_eventCount_check" CHECK ("eventCount" >= 0),
  CONSTRAINT "analytics_event_daily_rollups_pkey" PRIMARY KEY ("bucketDate", "event", "categoryId")
);

CREATE INDEX "analytics_event_daily_rollups_event_bucketDate_idx"
  ON "analytics_event_daily_rollups" ("event", "bucketDate");

CREATE TABLE "analytics_rollup_days" (
  "bucketDate" DATE NOT NULL,
  "sourceEventCount" BIGINT NOT NULL,
  "rollupRowCount" INTEGER NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_rollup_days_sourceEventCount_check" CHECK ("sourceEventCount" >= 0),
  CONSTRAINT "analytics_rollup_days_rollupRowCount_check" CHECK ("rollupRowCount" >= 0),
  CONSTRAINT "analytics_rollup_days_pkey" PRIMARY KEY ("bucketDate")
);
