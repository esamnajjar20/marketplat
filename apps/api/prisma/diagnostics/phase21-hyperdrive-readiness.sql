-- MarketPlat pre-Hyperdrive readiness snapshot (read-only).
-- Run on Aiven as a role allowed to inspect pg_stat_activity.
-- No application data is changed. Query text and parameter values are not returned.

-- 1) Server-wide process and client-session counts.
WITH setting_values AS (
  SELECT
    MAX(setting) FILTER (WHERE name = 'max_connections')::integer AS max_connections,
    COALESCE(MAX(setting) FILTER (WHERE name = 'superuser_reserved_connections'), '0')::integer
      AS superuser_reserved_connections,
    COALESCE(MAX(setting) FILTER (WHERE name = 'reserved_connections'), '0')::integer
      AS reserved_connections
  FROM pg_settings
  WHERE name IN ('max_connections', 'superuser_reserved_connections', 'reserved_connections')
),
activity AS (
  SELECT
    COUNT(*)::integer AS visible_activity_rows,
    COUNT(*) FILTER (WHERE backend_type = 'client backend')::integer AS client_backends,
    COUNT(*) FILTER (WHERE backend_type IS DISTINCT FROM 'client backend')::integer AS non_client_backends,
    COUNT(*) FILTER (WHERE backend_type = 'client backend' AND state = 'active')::integer AS active_clients,
    COUNT(*) FILTER (WHERE backend_type = 'client backend' AND state = 'idle')::integer AS idle_clients,
    COUNT(*) FILTER (WHERE backend_type = 'client backend' AND state LIKE 'idle in transaction%')::integer AS idle_in_transaction_clients,
    COUNT(*) FILTER (WHERE datname = current_database() AND backend_type = 'client backend')::integer AS current_db_client_backends
  FROM pg_stat_activity
)
SELECT
  clock_timestamp() AS captured_at,
  current_database() AS current_database,
  current_user AS monitoring_role,
  activity.visible_activity_rows,
  activity.client_backends,
  activity.non_client_backends,
  activity.active_clients,
  activity.idle_clients,
  activity.idle_in_transaction_clients,
  activity.current_db_client_backends,
  setting_values.max_connections,
  setting_values.superuser_reserved_connections,
  setting_values.reserved_connections,
  ROUND(100.0 * activity.client_backends / NULLIF(setting_values.max_connections, 0), 2) AS client_usage_percent_of_max
FROM activity CROSS JOIN setting_values;

-- 2) Attribute client sessions to service/application/database/user/address/state.
SELECT
  clock_timestamp() AS captured_at,
  COALESCE(datname, '<no database>') AS database_name,
  usename AS database_user,
  COALESCE(NULLIF(application_name, ''), '<empty>') AS application_name,
  COALESCE(client_addr::text, 'LOCAL') AS client_addr,
  state,
  wait_event_type,
  wait_event,
  COUNT(*) AS sessions,
  MIN(backend_start) AS oldest_session,
  MAX(backend_start) AS newest_session
FROM pg_stat_activity
WHERE backend_type = 'client backend'
GROUP BY datname, usename, application_name, client_addr, state, wait_event_type, wait_event
ORDER BY sessions DESC, application_name, client_addr;

-- 3) Active statements older than two seconds. SQL text is intentionally omitted.
SELECT
  pid,
  application_name,
  usename,
  datname,
  clock_timestamp() - query_start AS query_age,
  wait_event_type,
  wait_event,
  backend_type
FROM pg_stat_activity
WHERE backend_type = 'client backend'
  AND state = 'active'
  AND query_start IS NOT NULL
  AND pid <> pg_backend_pid()
  AND query_start < clock_timestamp() - INTERVAL '2 seconds'
ORDER BY query_start
LIMIT 50;

-- 4) Idle-in-transaction sessions. These may retain locks/snapshots and need review.
SELECT
  pid,
  application_name,
  usename,
  datname,
  clock_timestamp() - xact_start AS transaction_age,
  state,
  wait_event_type,
  wait_event
FROM pg_stat_activity
WHERE backend_type = 'client backend'
  AND state LIKE 'idle in transaction%'
  AND xact_start IS NOT NULL
ORDER BY xact_start
LIMIT 50;

-- 5) Blocked sessions and blocker identifiers; no SQL text is returned.
SELECT
  activity.pid AS blocked_pid,
  activity.application_name AS blocked_application,
  activity.usename AS blocked_user,
  clock_timestamp() - activity.query_start AS blocked_query_age,
  blocker.pid AS blocker_pid,
  blocker.application_name AS blocker_application,
  blocker.usename AS blocker_user,
  blocker.state AS blocker_state
FROM pg_stat_activity AS activity
CROSS JOIN LATERAL unnest(pg_blocking_pids(activity.pid)) AS blocked_by(blocker_pid)
JOIN pg_stat_activity AS blocker ON blocker.pid = blocked_by.blocker_pid
WHERE activity.backend_type = 'client backend'
ORDER BY activity.query_start NULLS LAST;

-- 6) Database-level cumulative counters. Compare snapshots over a measured interval;
-- these are counters since stats_reset, not interval rates by themselves.
SELECT
  datname,
  numbackends,
  xact_commit,
  xact_rollback,
  deadlocks,
  blks_read,
  blks_hit,
  ROUND(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 2) AS buffer_cache_hit_percent,
  temp_files,
  temp_bytes,
  stats_reset
FROM pg_stat_database
WHERE datname = current_database();

-- 7) Largest relations, useful when correlating disk growth with query behavior.
SELECT
  relname AS relation_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  pg_size_pretty(pg_indexes_size(relid)) AS indexes_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 25;

-- 8) Replication status when this role/database topology exposes it.
SELECT
  application_name,
  client_addr,
  state,
  sync_state,
  write_lag,
  flush_lag,
  replay_lag
FROM pg_stat_replication
ORDER BY application_name;
