-- Per-device push delivery ledger. Stores database row ids only, never endpoint URLs or FCM tokens.
ALTER TABLE "notification_push_dispatches"
  ADD COLUMN "targetsSeededAt" TIMESTAMP(3);

CREATE TABLE "notification_push_delivery_targets" (
  "id" TEXT NOT NULL,
  "dispatchId" TEXT NOT NULL,
  "channel" VARCHAR(16) NOT NULL,
  "targetId" TEXT NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "lastError" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_push_delivery_targets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_push_delivery_targets_dispatchId_fkey"
    FOREIGN KEY ("dispatchId") REFERENCES "notification_push_dispatches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "notification_push_delivery_targets_dispatchId_channel_targetId_key"
  ON "notification_push_delivery_targets"("dispatchId", "channel", "targetId");
CREATE INDEX "notification_push_delivery_targets_dispatchId_status_availableAt_idx"
  ON "notification_push_delivery_targets"("dispatchId", "status", "availableAt");
CREATE INDEX "notification_push_delivery_targets_status_availableAt_idx"
  ON "notification_push_delivery_targets"("status", "availableAt");
