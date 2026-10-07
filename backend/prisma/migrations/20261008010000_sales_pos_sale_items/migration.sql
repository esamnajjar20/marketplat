-- SALES POS: multi-line sales, per-line stock movements and item-level returns.
CREATE TABLE "sale_items" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "productId" TEXT,
  "entityType" "SaleEntityType" NOT NULL,
  "entityId" TEXT,
  "title" TEXT NOT NULL,
  "imageUrl" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "costPrice" DECIMAL(10,2),
  "lineTotal" DECIMAL(10,2) NOT NULL,
  "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
  "stockMovementId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sale_items_stockMovementId_key" ON "sale_items"("stockMovementId");
CREATE INDEX "sale_items_saleId_idx" ON "sale_items"("saleId");
CREATE INDEX "sale_items_productId_createdAt_idx" ON "sale_items"("productId", "createdAt");
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_returns" ADD COLUMN "itemId" TEXT;
CREATE INDEX "sale_returns_itemId_idx" ON "sale_returns"("itemId");
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "sale_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill one item per existing sale so historical invoices participate in the
-- new POS/return model without changing their totals or inventory movements.
INSERT INTO "sale_items" ("id", "saleId", "productId", "entityType", "entityId", "title", "imageUrl", "quantity", "unitPrice", "costPrice", "lineTotal", "returnedQuantity", "stockMovementId", "createdAt", "updatedAt")
SELECT
  'legacy_' || s."id",
  s."id",
  CASE WHEN s."entityType" = 'PRODUCT' THEN s."entityId" ELSE NULL END,
  s."entityType",
  s."entityId",
  s."entityTitle",
  s."entityImageUrl",
  s."quantity",
  s."unitPrice",
  s."costPrice",
  s."totalPrice",
  COALESCE((SELECT SUM(r."quantity") FROM "sale_returns" r WHERE r."saleId" = s."id"), 0),
  s."stockMovementId",
  s."createdAt",
  s."updatedAt"
FROM "sale_records" s
WHERE NOT EXISTS (SELECT 1 FROM "sale_items" i WHERE i."saleId" = s."id");

UPDATE "sale_returns" r
SET "itemId" = 'legacy_' || r."saleId"
WHERE r."itemId" IS NULL;
