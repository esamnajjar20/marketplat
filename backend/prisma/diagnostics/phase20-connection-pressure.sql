-- MarketPlat Phase 20: read-only PostgreSQL connection/query pressure snapshot.
-- Run against the SAME Neon database/role used by the backend. These queries
-- inspect the current server view; they do not change schema or application data.
-- Avoid exporting raw query text to public tickets because it can contain PII.

-- 1) Current sessions by state and wait event. Compare during a quiet period and
-- during repeated GET /api/v1/home/feed requests.
SELECT COALESCE(state, '(unknown)') AS state,
       COALESCE(wait_event_type, '(none)') AS wait_event_type,
       COALESCE(wait_event, '(none)') AS wait_event,
       COUNT(*) AS sessions
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY 1, 2, 3
ORDER BY sessions DESC, state;

-- 2) Connection counts vs configured server limit. On a pooled endpoint this
-- is the server-side view, not necessarily the provider's client-pool queue.
SELECT current_database() AS database_name,
       (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database()) AS sessions_for_database,
       (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS server_max_connections,
       (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active') AS active_sessions,
       (SELECT COUNT(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction') AS idle_in_transaction_sessions;

-- 3) Long-running active statements (query text intentionally omitted).
SELECT pid, application_name, usename, state,
       clock_timestamp() - query_start AS query_age,
       wait_event_type, wait_event
FROM pg_stat_activity
WHERE datname = current_database()
  AND state = 'active'
  AND query_start IS NOT NULL
  AND pid <> pg_backend_pid()
ORDER BY query_start ASC
LIMIT 30;

-- 4) Transactions left open for a long time.
SELECT pid, application_name, usename,
       clock_timestamp() - xact_start AS transaction_age,
       state, wait_event_type, wait_event
FROM pg_stat_activity
WHERE datname = current_database()
  AND xact_start IS NOT NULL
  AND pid <> pg_backend_pid()
ORDER BY xact_start ASC
LIMIT 30;

-- 5) Database-level block/commit/read counters. These are cumulative since the
-- last stats reset; compare two snapshots over a known interval for deltas.
SELECT datname, numbackends, xact_commit, xact_rollback,
       blks_read, blks_hit, deadlocks, stats_reset
FROM pg_stat_database
WHERE datname = current_database();

-- 6) OPTIONAL: if pg_stat_statements is installed and permissions allow it,
-- uncomment to rank normalized statements by total time. Keep output private.
-- SELECT calls, round(total_exec_time::numeric, 2) AS total_ms,
--        round(mean_exec_time::numeric, 2) AS mean_ms, rows,
--        LEFT(query, 240) AS query_sample
-- FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;
