-- Idempotency key for offline sales replay.
ALTER TABLE "sale_records" ADD COLUMN "offlineOperationId" TEXT;
CREATE UNIQUE INDEX "sale_records_sellerId_offlineOperationId_key"
  ON "sale_records"("sellerId", "offlineOperationId");
