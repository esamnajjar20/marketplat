CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "changedByUserId" TEXT NOT NULL,
    "previousQuantity" INTEGER,
    "newQuantity" INTEGER,
    "delta" INTEGER,
    "reason" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_movements_storeId_createdAt_idx"
    ON "stock_movements"("storeId", "createdAt");
CREATE INDEX "stock_movements_productId_createdAt_idx"
    ON "stock_movements"("productId", "createdAt");
CREATE INDEX "stock_movements_changedByUserId_createdAt_idx"
    ON "stock_movements"("changedByUserId", "createdAt");

ALTER TABLE "stock_movements"
    ADD CONSTRAINT "stock_movements_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
