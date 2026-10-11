-- Quarantine poison outbox events after bounded processing attempts without deleting payloads.
ALTER TABLE "outbox_events"
  ADD COLUMN "deadLetterAt" TIMESTAMP(3);

-- Supports operational inspection of quarantined and processed events.
CREATE INDEX "outbox_events_deadLetterAt_processedAt_idx"
  ON "outbox_events" ("deadLetterAt", "processedAt");
