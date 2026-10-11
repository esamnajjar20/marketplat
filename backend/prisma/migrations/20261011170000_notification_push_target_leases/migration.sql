-- Prevent duplicate concurrent sends when a dispatch lease expires during a slow provider call.
ALTER TABLE "notification_push_delivery_targets"
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockedBy" VARCHAR(120);

CREATE INDEX "notification_push_delivery_targets_status_lockedAt_idx"
  ON "notification_push_delivery_targets"("status", "lockedAt");
