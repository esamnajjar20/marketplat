CREATE TYPE "MarketplaceOrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

CREATE TABLE "marketplace_orders" (
  "id" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "status" "MarketplaceOrderStatus" NOT NULL DEFAULT 'PENDING',
  "currency" TEXT NOT NULL DEFAULT 'ILS',
  "subtotal" DECIMAL(10,2) NOT NULL,
  "shippingFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(10,2) NOT NULL,
  "paymentMethod" TEXT NOT NULL DEFAULT 'CASH_ON_DELIVERY',
  "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
  "recipientName" VARCHAR(160) NOT NULL,
  "recipientPhone" VARCHAR(40) NOT NULL,
  "shippingCity" VARCHAR(100) NOT NULL,
  "shippingAddress" VARCHAR(500) NOT NULL,
  "buyerNote" VARCHAR(1000),
  "sellerNote" VARCHAR(1000),
  "idempotencyKey" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "shippedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketplace_order_items" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT,
  "productName" VARCHAR(200) NOT NULL,
  "productImage" TEXT,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "lineTotal" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketplace_order_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_orders_buyerId_idempotencyKey_key" ON "marketplace_orders"("buyerId", "idempotencyKey");
CREATE INDEX "marketplace_orders_buyerId_createdAt_idx" ON "marketplace_orders"("buyerId", "createdAt");
CREATE INDEX "marketplace_orders_sellerId_status_createdAt_idx" ON "marketplace_orders"("sellerId", "status", "createdAt");
CREATE INDEX "marketplace_orders_storeId_createdAt_idx" ON "marketplace_orders"("storeId", "createdAt");
CREATE INDEX "marketplace_order_items_orderId_idx" ON "marketplace_order_items"("orderId");
CREATE INDEX "marketplace_order_items_productId_idx" ON "marketplace_order_items"("productId");

ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "store_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_order_items" ADD CONSTRAINT "marketplace_order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
