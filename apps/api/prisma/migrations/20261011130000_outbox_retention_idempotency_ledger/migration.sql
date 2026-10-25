-- Preserve outbox idempotency after old processed payload rows are pruned.
-- The ledger stores only keys and timestamps, not the potentially large JSON payload.
CREATE TABLE "outbox_event_idempotency" (
  "idempotencyKey" TEXT NOT NULL,
  "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "outbox_event_idempotency_pkey" PRIMARY KEY ("idempotencyKey")
);

-- Backfill before installing the trigger so every pre-existing event key remains reserved.
INSERT INTO "outbox_event_idempotency" ("idempotencyKey", "recordedAt")
SELECT "idempotencyKey", MIN("createdAt")
FROM "outbox_events"
GROUP BY "idempotencyKey";

CREATE OR REPLACE FUNCTION reserve_outbox_event_idempotency_key()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "outbox_event_idempotency" ("idempotencyKey", "recordedAt")
  VALUES (NEW."idempotencyKey", CURRENT_TIMESTAMP);
  RETURN NEW;
END;
$$;

CREATE TRIGGER "outbox_events_reserve_idempotency_key"
BEFORE INSERT ON "outbox_events"
FOR EACH ROW
EXECUTE FUNCTION reserve_outbox_event_idempotency_key();

-- Supports bounded oldest-processed-first retention batches.
CREATE INDEX "outbox_events_processedAt_retention_idx"
ON "outbox_events" ("processedAt", "id")
WHERE "processedAt" IS NOT NULL;
