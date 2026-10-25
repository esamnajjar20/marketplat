-- Outbox-delivered notifications use one durable key per event and recipient.
-- NULL remains allowed for existing notification producers.
ALTER TABLE "notifications" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "notifications_idempotencyKey_key" ON "notifications"("idempotencyKey");
