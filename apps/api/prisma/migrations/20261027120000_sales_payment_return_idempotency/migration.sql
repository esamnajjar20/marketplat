-- Make retried payment and return mutations idempotent when the client supplies
-- an operation ID. PostgreSQL permits multiple NULL values in a unique column.
ALTER TABLE "sale_payments" ADD COLUMN "offlineOperationId" TEXT;
CREATE UNIQUE INDEX "sale_payments_offlineOperationId_key" ON "sale_payments"("offlineOperationId");

ALTER TABLE "sale_returns" ADD COLUMN "offlineOperationId" TEXT;
CREATE UNIQUE INDEX "sale_returns_offlineOperationId_key" ON "sale_returns"("offlineOperationId");
