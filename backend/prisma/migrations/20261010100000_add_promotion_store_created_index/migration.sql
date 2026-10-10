-- Speeds up GET /promotions/me, which filters by storeId and orders by createdAt DESC.
CREATE INDEX IF NOT EXISTS "promotions_storeId_createdAt_idx" ON "promotions"("storeId", "createdAt");
