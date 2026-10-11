-- offlineOperationId is intentionally unique per seller, not globally.
-- This index may exist in databases where schema.prisma was previously pushed directly.
DROP INDEX IF EXISTS "sale_records_offlineOperationId_key";

-- Align PostgreSQL indexes with schema.prisma and remove duplicate index structures.
-- The composite unique index already supports lookups by (saleId, installmentNo).
DROP INDEX IF EXISTS "sale_installments_saleId_installmentNo_idx";

-- storeId is already backed by a unique index, which supports ordinary equality lookups.
DROP INDEX IF EXISTS "sales_stats_cache_storeId_idx";
