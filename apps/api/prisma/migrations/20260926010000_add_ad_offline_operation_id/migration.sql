-- FIX OFFLINE-IDEMPOTENCY-01: unique offline operation id for ad create replay safety
ALTER TABLE "ads" ADD COLUMN IF NOT EXISTS "offlineOperationId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ads_offlineOperationId_key" ON "ads"("offlineOperationId");

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "offlineOperationId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "products_offlineOperationId_key" ON "products"("offlineOperationId");

ALTER TABLE "service_listings" ADD COLUMN IF NOT EXISTS "offlineOperationId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "service_listings_offlineOperationId_key" ON "service_listings"("offlineOperationId");

ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "offlineOperationId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "requests_offlineOperationId_key" ON "requests"("offlineOperationId");

ALTER TABLE "service_requests" ADD COLUMN IF NOT EXISTS "offlineOperationId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "service_requests_offlineOperationId_key" ON "service_requests"("offlineOperationId");
