-- MarketPlat DB cost optimization — Phase 18
-- READ-ONLY diagnostics for PostgreSQL / Neon. Run against staging first.
-- Does not enable extensions, change settings, or create/drop indexes.

-- 1) Confirm whether pg_stat_statements is available (extension must be enabled by an administrator).
SELECT e.extname, e.extversion
FROM pg_extension e
WHERE e.extname = 'pg_stat_statements';

-- 2) Top normalized statements by total execution time, if pg_stat_statements is enabled.
-- If the extension is absent, skip this query; do not enable it without checking provider permissions.
SELECT queryid,
       calls,
       round(total_exec_time::numeric, 2) AS total_exec_ms,
       round(mean_exec_time::numeric, 2) AS mean_exec_ms,
       round(max_exec_time::numeric, 2) AS max_exec_ms,
       rows,
       shared_blks_hit,
       shared_blks_read,
       left(regexp_replace(query, '\s+', ' ', 'g'), 500) AS query_sample
FROM pg_stat_statements
WHERE query ILIKE '%store_details%'
   OR query ILIKE '%service_provider_details%'
   OR query ILIKE '%service_listings%'
   OR query ILIKE '%home%feed%'
ORDER BY total_exec_time DESC
LIMIT 30;

-- 3) Existing indexes on recommendation-related tables.
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('store_details', 'products', 'service_provider_details', 'service_listings', 'store_followers', 'seller_profiles')
ORDER BY tablename, indexname;

-- 4) Approximate table sizes and row estimates; estimates are not exact counts.
SELECT relname AS table_name,
       n_live_tup AS estimated_live_rows,
       n_dead_tup AS estimated_dead_rows,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       last_analyze,
       last_autoanalyze
FROM pg_stat_user_tables
WHERE relname IN ('store_details', 'products', 'service_provider_details', 'service_listings', 'store_followers', 'seller_profiles')
ORDER BY pg_total_relation_size(relid) DESC;

-- 5) Index usage and size. Low scans alone do NOT prove an index is removable.
SELECT t.relname AS table_name,
       i.relname AS index_name,
       s.idx_scan,
       s.idx_tup_read,
       s.idx_tup_fetch,
       pg_size_pretty(pg_relation_size(i.oid)) AS index_size
FROM pg_stat_user_indexes s
JOIN pg_class t ON t.oid = s.relid
JOIN pg_class i ON i.oid = s.indexrelid
WHERE t.relname IN ('store_details', 'products', 'service_provider_details', 'service_listings', 'store_followers', 'seller_profiles')
ORDER BY t.relname, s.idx_scan DESC, i.relname;

-- 6) Current database activity snapshot. Run during a representative test window.
SELECT state,
       wait_event_type,
       wait_event,
       count(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state, wait_event_type, wait_event
ORDER BY connections DESC;

-- EXPLAIN guidance:
-- Capture the exact parameterized SQL emitted by the application from staging logs,
-- substitute representative values safely, then run EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)
-- on that READ query only. Never paste secrets or user data into shared logs.
-- Compare several runs; record plan, actual rows, buffers, sort spill, execution time,
-- and application-side pool-acquisition latency. Do not add an index based on one run.
