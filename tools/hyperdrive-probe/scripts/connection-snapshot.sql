-- Read-only PostgreSQL connection snapshot for the current database.
-- Run before, during, and immediately after a Hyperdrive load test.
-- The psql session running this query is itself included in the connection counts.
-- Query text and user identifiers are intentionally excluded from this report.

WITH database_stats AS (
  SELECT
    datname,
    numbackends
  FROM pg_stat_database
  WHERE datname = current_database()
),
activity_stats AS (
  SELECT
    COUNT(*)::integer AS visible_activity_rows,
    COUNT(*) FILTER (WHERE state = 'active')::integer AS active_connections,
    COUNT(*) FILTER (WHERE state = 'idle')::integer AS idle_connections,
    COUNT(*) FILTER (WHERE state = 'idle in transaction')::integer AS idle_in_transaction_connections,
    COUNT(*) FILTER (WHERE state IS NULL OR state NOT IN ('active', 'idle', 'idle in transaction'))::integer AS other_state_connections
  FROM pg_stat_activity
  WHERE datname = current_database()
)
SELECT
  current_database() AS database_name,
  clock_timestamp() AS captured_at,
  COALESCE(database_stats.numbackends, 0)::integer AS current_backend_connections,
  activity_stats.visible_activity_rows,
  activity_stats.active_connections,
  activity_stats.idle_connections,
  activity_stats.idle_in_transaction_connections,
  activity_stats.other_state_connections
FROM database_stats
CROSS JOIN activity_stats;
