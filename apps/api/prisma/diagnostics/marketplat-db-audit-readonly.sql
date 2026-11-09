-- MarketPlat PostgreSQL read-only diagnostics.
-- Run using a READ-ONLY database role, preferably against a replica first:
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f marketplat-db-audit-readonly.sql
-- No DDL/DML is issued. The snapshot is bounded by statement_timeout.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '1s';

-- 1) Server/database identity and pool pressure.
SELECT
  current_database() AS database_name,
  current_user AS audit_role,
  current_setting('server_version') AS server_version,
  current_setting('max_connections')::int AS max_connections,
  COUNT(*) FILTER (WHERE state = 'active') AS active_sessions,
  COUNT(*) FILTER (WHERE wait_event_type = 'Lock') AS sessions_waiting_on_locks,
  COUNT(*) AS sessions_for_database
FROM pg_stat_activity
WHERE datname = current_database();

-- 2) Prisma migration ledger. Any unfinished row needs investigation before deploy.
SELECT
  COUNT(*) AS migration_rows,
  COUNT(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied_rows,
  COUNT(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS rolled_back_rows,
  COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS unfinished_rows
FROM "_prisma_migrations";

SELECT migration_name, started_at, finished_at, rolled_back_at,
       LEFT(COALESCE(logs, ''), 1000) AS logs_excerpt
FROM "_prisma_migrations"
WHERE finished_at IS NULL AND rolled_back_at IS NULL
ORDER BY started_at;

-- 3) Largest user tables and approximate row/dead-row counts.
-- n_live_tup / n_dead_tup are estimates, not exact COUNT(*) values.
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS estimated_live_rows,
  n_dead_tup AS estimated_dead_rows,
  seq_scan,
  idx_scan,
  pg_size_pretty(pg_relation_size(relid)) AS heap_size,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 40;

-- 4) Index usage/size. Zero scans are not proof of an unused index:
-- first check stats_reset, workload coverage, constraints and FK duties.
SELECT
  s.schemaname,
  s.relname AS table_name,
  s.indexrelname AS index_name,
  s.idx_scan,
  s.idx_tup_read,
  s.idx_tup_fetch,
  pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
  pg_get_indexdef(s.indexrelid) AS definition
FROM pg_stat_user_indexes s
ORDER BY pg_relation_size(s.indexrelid) DESC
LIMIT 100;

-- 5) Foreign keys without a valid, non-partial B-tree index whose leading
-- key columns match the FK column order. Candidate report only; assess table
-- size, parent delete/update rate, and workload before adding indexes.
SELECT
  con.conrelid::regclass AS child_table,
  con.conname AS foreign_key,
  con.confrelid::regclass AS parent_table,
  ARRAY(
    SELECT a.attname
    FROM unnest(con.conkey) WITH ORDINALITY AS fk(attnum, ord)
    JOIN pg_attribute a
      ON a.attrelid = con.conrelid AND a.attnum = fk.attnum
    ORDER BY fk.ord
  ) AS fk_columns,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
WHERE con.contype = 'f'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class index_relation ON index_relation.oid = i.indexrelid
    JOIN pg_am access_method ON access_method.oid = index_relation.relam
    WHERE i.indrelid = con.conrelid
      AND access_method.amname = 'btree'
      AND i.indisvalid
      AND i.indisready
      AND i.indpred IS NULL
      AND i.indnkeyatts >= cardinality(con.conkey)
      AND ARRAY(
        SELECT key_column.attnum
        FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS key_column(attnum, ord)
        WHERE key_column.ord <= cardinality(con.conkey)
        ORDER BY key_column.ord
      ) = con.conkey
  )
ORDER BY con.conrelid::regclass::text, con.conname;

-- 6) Database-level cumulative counters. Compare deltas between snapshots;
-- these counters are since stats_reset, not a per-query diagnosis.
SELECT
  datname,
  xact_commit,
  xact_rollback,
  blks_read,
  blks_hit,
  CASE WHEN blks_hit + blks_read = 0 THEN NULL
       ELSE ROUND(100.0 * blks_hit / (blks_hit + blks_read), 2) END AS shared_buffer_hit_pct,
  tup_returned,
  tup_fetched,
  deadlocks,
  temp_files,
  pg_size_pretty(temp_bytes) AS temp_bytes,
  stats_reset
FROM pg_stat_database
WHERE datname = current_database();

COMMIT;

-- 7) Optional: run separately only if pg_stat_statements is installed and
-- the audit role has permission. Sort by total execution time first; then
-- inspect calls, mean/max time, rows, and shared/local/temp block activity.
-- SELECT queryid, calls, total_exec_time, mean_exec_time, max_exec_time,
--        rows, shared_blks_hit, shared_blks_read, temp_blks_written,
--        LEFT(query, 1200) AS query_sample
-- FROM pg_stat_statements
-- ORDER BY total_exec_time DESC
-- LIMIT 50;

-- 8) Safe read-only EXPLAIN templates. Replace the literal with a real test
-- user/store ID and run on representative data. Compare before/after buffers,
-- actual rows, loops, and execution time; do not infer benefit from index
-- existence alone.
-- EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
-- SELECT id, "createdAt" FROM reports
-- WHERE "userId" = 'REPLACE_WITH_TEST_USER_ID'
-- ORDER BY "createdAt" DESC, id DESC LIMIT 21;
--
-- EXPLAIN (ANALYZE, BUFFERS, SETTINGS)
-- SELECT id, name, views FROM products
-- WHERE "storeId" = 'REPLACE_WITH_TEST_STORE_ID' AND status = 'ACTIVE'
-- ORDER BY views DESC LIMIT 5;
