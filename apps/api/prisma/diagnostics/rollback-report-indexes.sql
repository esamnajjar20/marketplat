-- Optional rollback for migration 20261109100000_add_report_lookup_and_fk_indexes.
-- This removes only the two additional indexes; it does not touch table data,
-- constraints, columns, or older migrations. Run manually only when intended.
DROP INDEX CONCURRENTLY IF EXISTS "reports_userId_createdAt_id_idx";
DROP INDEX CONCURRENTLY IF EXISTS "reports_adId_idx";
