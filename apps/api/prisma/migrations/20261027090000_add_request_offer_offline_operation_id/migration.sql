ALTER TABLE "request_offers" ADD COLUMN IF NOT EXISTS "offlineOperationId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "request_offers_offlineOperationId_key" ON "request_offers"("offlineOperationId");
