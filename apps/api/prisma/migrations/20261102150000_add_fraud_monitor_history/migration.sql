-- Privacy-minimal fraud-monitor history. Persist aggregate counts only;
-- entity IDs, report notes, contact fields and sample payloads are deliberately
-- not copied from the read-only scan response.
CREATE TABLE "fraud_monitor_scan_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "trigger" VARCHAR(16) NOT NULL,
  "scheduledFor" DATE,
  "status" VARCHAR(16) NOT NULL DEFAULT 'RUNNING',
  "executionPath" VARCHAR(16),
  "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  "durationMillis" INTEGER,
  "checkCount" INTEGER NOT NULL DEFAULT 0,
  "findingCount" BIGINT NOT NULL DEFAULT 0,
  "criticalCount" BIGINT NOT NULL DEFAULT 0,
  "warningCount" BIGINT NOT NULL DEFAULT 0,
  "infoCount" BIGINT NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 1,
  "failureCode" VARCHAR(80),
  CONSTRAINT "fraud_monitor_scan_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fraud_monitor_scan_runs_trigger_check" CHECK ("trigger" IN ('MANUAL', 'SCHEDULED')),
  CONSTRAINT "fraud_monitor_scan_runs_status_check" CHECK ("status" IN ('RUNNING', 'COMPLETED', 'FAILED')),
  CONSTRAINT "fraud_monitor_scan_runs_execution_path_check" CHECK ("executionPath" IS NULL OR "executionPath" IN ('GO', 'EXPRESS')),
  CONSTRAINT "fraud_monitor_scan_runs_duration_check" CHECK ("durationMillis" IS NULL OR "durationMillis" >= 0),
  CONSTRAINT "fraud_monitor_scan_runs_counts_check" CHECK (
    "checkCount" >= 0 AND "findingCount" >= 0 AND "criticalCount" >= 0 AND
    "warningCount" >= 0 AND "infoCount" >= 0 AND "attempts" >= 1
  )
);

-- PostgreSQL permits multiple NULLs in a regular unique index, so manual runs
-- remain unrestricted while each scheduled business date is idempotent.
CREATE UNIQUE INDEX "fraud_monitor_scan_runs_scheduledFor_key"
  ON "fraud_monitor_scan_runs" ("scheduledFor");
CREATE INDEX "fraud_monitor_scan_runs_status_startedAt_idx"
  ON "fraud_monitor_scan_runs" ("status", "startedAt");
CREATE INDEX "fraud_monitor_scan_runs_startedAt_idx"
  ON "fraud_monitor_scan_runs" ("startedAt");

CREATE TABLE "fraud_monitor_check_snapshots" (
  "scanRunId" UUID NOT NULL,
  "checkCode" VARCHAR(64) NOT NULL,
  "severity" VARCHAR(16) NOT NULL,
  "findingCount" BIGINT NOT NULL DEFAULT 0,
  "sampleCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "fraud_monitor_check_snapshots_pkey" PRIMARY KEY ("scanRunId", "checkCode"),
  CONSTRAINT "fraud_monitor_check_snapshots_run_fkey"
    FOREIGN KEY ("scanRunId") REFERENCES "fraud_monitor_scan_runs" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "fraud_monitor_check_snapshots_severity_check" CHECK ("severity" IN ('critical', 'warning', 'info')),
  CONSTRAINT "fraud_monitor_check_snapshots_counts_check" CHECK ("findingCount" >= 0 AND "sampleCount" >= 0)
);
CREATE INDEX "fraud_monitor_check_snapshots_checkCode_scanRunId_idx"
  ON "fraud_monitor_check_snapshots" ("checkCode", "scanRunId");
