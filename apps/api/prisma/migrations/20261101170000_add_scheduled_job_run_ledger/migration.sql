-- Durable scheduler execution ledger. This prevents duplicate daily runs and
-- allows a weekday-restricted job to catch up once on the following day when
-- GitHub Actions delayed or missed the scheduled invocation.
CREATE TABLE "scheduled_job_runs" (
  "jobName" TEXT NOT NULL,
  "scheduledFor" VARCHAR(10) NOT NULL,
  "status" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "lastError" VARCHAR(2000),
  CONSTRAINT "scheduled_job_runs_pkey" PRIMARY KEY ("jobName", "scheduledFor"),
  CONSTRAINT "scheduled_job_runs_status_check" CHECK ("status" IN ('RUNNING', 'FAILED', 'COMPLETED')),
  CONSTRAINT "scheduled_job_runs_date_check" CHECK ("scheduledFor" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  CONSTRAINT "scheduled_job_runs_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX "scheduled_job_runs_status_startedAt_idx"
  ON "scheduled_job_runs" ("status", "startedAt");
