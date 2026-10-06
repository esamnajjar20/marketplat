-- SALES-LOG P1: private seller sales ledger foundation.
CREATE TYPE "SaleEntityType" AS ENUM ('PRODUCT', 'AD', 'SERVICE', 'FREE');
CREATE TYPE "SalePaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'UNPAID', 'OVERDUE');
CREATE TYPE "SaleTransferMethod" AS ENUM ('CASH', 'JAWWAL_PAY', 'BANK_PALESTINE', 'PALPAY', 'CARD', 'OTHER');
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'PARTIAL');
CREATE TYPE "ReturnReason" AS ENUM ('DAMAGED', 'WRONG_ITEM', 'NOT_LIKED', 'LATE', 'OTHER');

CREATE TABLE "sales_customers" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "address" TEXT,
  "note" TEXT,
  "tags" TEXT[] NOT NULL,
  "totalSpent" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "totalDue" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "purchaseCount" INTEGER NOT NULL DEFAULT 0,
  "lastPurchaseAt" TIMESTAMP(3),
  "firstPurchaseAt" TIMESTAMP(3),
  "isVip" BOOLEAN NOT NULL DEFAULT false,
  "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_customers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sales_customers_sellerId_phone_key" ON "sales_customers"("sellerId","phone");
CREATE INDEX "sales_customers_sellerId_name_idx" ON "sales_customers"("sellerId","name");
CREATE INDEX "sales_customers_sellerId_totalDue_idx" ON "sales_customers"("sellerId","totalDue");
CREATE INDEX "sales_customers_sellerId_lastPurchaseAt_idx" ON "sales_customers"("sellerId","lastPurchaseAt");
ALTER TABLE "sales_customers" ADD CONSTRAINT "sales_customers_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "invoice_counters" (
  "id" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoice_counters_year_key" ON "invoice_counters"("year");

CREATE TABLE "sales_stats_cache" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "storeId" TEXT,
  "totalSales" INTEGER NOT NULL DEFAULT 0,
  "totalRevenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "averageRating" DECIMAL(3,2),
  "reviewCount" INTEGER NOT NULL DEFAULT 0,
  "verifiedSeller" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_stats_cache_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sales_stats_cache_sellerId_key" ON "sales_stats_cache"("sellerId");
CREATE UNIQUE INDEX "sales_stats_cache_storeId_key" ON "sales_stats_cache"("storeId");
CREATE INDEX "sales_stats_cache_storeId_idx" ON "sales_stats_cache"("storeId");
ALTER TABLE "sales_stats_cache" ADD CONSTRAINT "sales_stats_cache_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_stats_cache" ADD CONSTRAINT "sales_stats_cache_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "store_details"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "sale_records" (
  "id" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "storeId" TEXT,
  "entityType" "SaleEntityType" NOT NULL,
  "entityId" TEXT,
  "entityTitle" TEXT NOT NULL,
  "entityImageUrl" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "costPrice" DECIMAL(10,2),
  "totalPrice" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'ILS',
  "invoiceNumber" TEXT,
  "invoicePdfUrl" TEXT,
  "customerId" TEXT,
  "buyerName" TEXT NOT NULL,
  "buyerPhone" TEXT,
  "paymentStatus" "SalePaymentStatus" NOT NULL DEFAULT 'PAID',
  "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "dueAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "dueDate" TIMESTAMP(3),
  "note" TEXT,
  "internalNote" TEXT,
  "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "stockMovementId" TEXT,
  "serviceRequestId" TEXT,
  CONSTRAINT "sale_records_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sale_records_invoiceNumber_key" ON "sale_records"("invoiceNumber");
CREATE UNIQUE INDEX "sale_records_stockMovementId_key" ON "sale_records"("stockMovementId");
CREATE UNIQUE INDEX "sale_records_serviceRequestId_key" ON "sale_records"("serviceRequestId");
CREATE INDEX "sale_records_sellerId_soldAt_idx" ON "sale_records"("sellerId","soldAt");
CREATE INDEX "sale_records_storeId_soldAt_idx" ON "sale_records"("storeId","soldAt");
CREATE INDEX "sale_records_sellerId_entityType_idx" ON "sale_records"("sellerId","entityType");
CREATE INDEX "sale_records_sellerId_paymentStatus_idx" ON "sale_records"("sellerId","paymentStatus");
CREATE INDEX "sale_records_customerId_soldAt_idx" ON "sale_records"("customerId","soldAt");
CREATE INDEX "sale_records_sellerId_invoiceNumber_idx" ON "sale_records"("sellerId","invoiceNumber");
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "store_details"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "sales_customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_records" ADD CONSTRAINT "sale_records_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "sale_payments" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "method" "SaleTransferMethod" NOT NULL,
  "transferRef" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sale_payments_saleId_paidAt_idx" ON "sale_payments"("saleId","paidAt");
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sale_installments" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "installmentNo" INTEGER NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3),
  "paidAmount" DECIMAL(10,2),
  "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  CONSTRAINT "sale_installments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sale_installments_saleId_installmentNo_key" ON "sale_installments"("saleId","installmentNo");
CREATE INDEX "sale_installments_saleId_installmentNo_idx" ON "sale_installments"("saleId","installmentNo");
CREATE INDEX "sale_installments_dueDate_status_idx" ON "sale_installments"("dueDate","status");
ALTER TABLE "sale_installments" ADD CONSTRAINT "sale_installments_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sale_returns" (
  "id" TEXT NOT NULL,
  "saleId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "refundAmount" DECIMAL(10,2) NOT NULL,
  "reason" "ReturnReason" NOT NULL,
  "reasonNote" TEXT,
  "restockedToInventory" BOOLEAN NOT NULL DEFAULT true,
  "stockMovementId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sale_returns_stockMovementId_key" ON "sale_returns"("stockMovementId");
CREATE INDEX "sale_returns_saleId_idx" ON "sale_returns"("saleId");
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing stock rows are linked to the new sale/return relations without
-- adding a new FK column; the unique foreign-key columns live on the child rows.
