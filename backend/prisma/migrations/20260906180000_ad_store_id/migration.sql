-- Optional store publisher on ads: personal ads keep storeId NULL.
ALTER TABLE "ads" ADD COLUMN IF NOT EXISTS "storeId" TEXT;

CREATE INDEX IF NOT EXISTS "ads_storeId_idx" ON "ads"("storeId");
CREATE INDEX IF NOT EXISTS "ads_storeId_status_createdAt_idx" ON "ads"("storeId", "status", "createdAt");

ALTER TABLE "ads"
  DROP CONSTRAINT IF EXISTS "ads_storeId_fkey";

ALTER TABLE "ads"
  ADD CONSTRAINT "ads_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "store_details"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
