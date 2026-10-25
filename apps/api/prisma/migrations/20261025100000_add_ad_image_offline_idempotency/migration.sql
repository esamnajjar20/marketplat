-- Durable replay protection for offline ad image uploads.
CREATE TABLE IF NOT EXISTS "AdImageOfflineOperation" (
  "id" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "adId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "imageUrls" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdImageOfflineOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdImageOfflineOperation_operationId_key"
  ON "AdImageOfflineOperation"("operationId");
CREATE INDEX IF NOT EXISTS "AdImageOfflineOperation_adId_userId_idx"
  ON "AdImageOfflineOperation"("adId", "userId");
CREATE INDEX IF NOT EXISTS "AdImageOfflineOperation_createdAt_idx"
  ON "AdImageOfflineOperation"("createdAt");
