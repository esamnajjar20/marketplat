-- Persist push handoff intent atomically with durable in-app notifications.
-- Existing notifications are intentionally not backfilled: doing so would send
-- historical pushes during deployment.
CREATE TABLE "notification_push_dispatches" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "processedAt" TIMESTAMP(3),
  "deadLetterAt" TIMESTAMP(3),
  "lastError" VARCHAR(1000),
  CONSTRAINT "notification_push_dispatches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_push_dispatches_notificationId_key"
  ON "notification_push_dispatches"("notificationId");
CREATE UNIQUE INDEX "notification_push_dispatches_idempotencyKey_key"
  ON "notification_push_dispatches"("idempotencyKey");
CREATE INDEX "notification_push_dispatches_processedAt_availableAt_createdAt_idx"
  ON "notification_push_dispatches"("processedAt", "availableAt", "createdAt");
CREATE INDEX "notification_push_dispatches_deadLetterAt_processedAt_idx"
  ON "notification_push_dispatches"("deadLetterAt", "processedAt");
CREATE INDEX "notification_push_dispatches_lockedAt_idx"
  ON "notification_push_dispatches"("lockedAt");

ALTER TABLE "notification_push_dispatches"
  ADD CONSTRAINT "notification_push_dispatches_notificationId_fkey"
  FOREIGN KEY ("notificationId") REFERENCES "notifications"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
