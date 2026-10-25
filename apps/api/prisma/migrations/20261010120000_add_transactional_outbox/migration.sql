-- Durable event queue. Events are inserted in the same SQL transaction as
-- the domain write and claimed by workers with FOR UPDATE SKIP LOCKED.
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "payload" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "processedAt" TIMESTAMP(3),
    "lastError" VARCHAR(1000),
    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "outbox_events_idempotencyKey_key" ON "outbox_events"("idempotencyKey");
CREATE INDEX "outbox_events_processedAt_availableAt_createdAt_idx" ON "outbox_events"("processedAt", "availableAt", "createdAt");
CREATE INDEX "outbox_events_lockedAt_idx" ON "outbox_events"("lockedAt");
