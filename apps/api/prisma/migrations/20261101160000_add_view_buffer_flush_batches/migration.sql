-- A durable receipt for Redis view-buffer batches. Each receipt is inserted
-- in the same PostgreSQL transaction as the corresponding ad view increments.
-- The Redis inflight payload is only acknowledged after that transaction commits.
CREATE TABLE "view_buffer_flush_batches" (
  "id" TEXT NOT NULL,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "adCount" INTEGER NOT NULL DEFAULT 0,
  "viewsCount" BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT "view_buffer_flush_batches_pkey" PRIMARY KEY ("id")
);
