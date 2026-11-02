-- Durable retries for Cloudinary assets that could not be deleted inline.
-- Only explicitly enqueued public IDs are eligible; this migration does not
-- scan or delete assets by folder and therefore cannot remove live media.
CREATE TABLE "media_cleanup_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "publicId" TEXT NOT NULL,
  "resourceType" VARCHAR(16) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMPTZ(3),
  "leaseToken" UUID,
  "lastError" VARCHAR(2000),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "media_cleanup_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "media_cleanup_jobs_resource_type_check" CHECK ("resourceType" IN ('image', 'video', 'raw')),
  CONSTRAINT "media_cleanup_jobs_status_check" CHECK ("status" IN ('PENDING', 'PROCESSING', 'COMPLETED', 'DEAD')),
  CONSTRAINT "media_cleanup_jobs_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "media_cleanup_jobs_resource_public_id_key" UNIQUE ("resourceType", "publicId")
);

CREATE INDEX "media_cleanup_jobs_status_next_attempt_idx"
  ON "media_cleanup_jobs" ("status", "nextAttemptAt");
CREATE INDEX "media_cleanup_jobs_status_locked_at_idx"
  ON "media_cleanup_jobs" ("status", "lockedAt");
