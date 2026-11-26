-- MarketPlat Phase 4: server-wide connection attribution snapshot.
-- Run in the Aiven PostgreSQL SQL console or with psql.
-- This intentionally distinguishes client backends from PostgreSQL background processes.
-- Do not interpret COUNT(*) over pg_stat_activity as the client connection count.

WITH settings AS (
  SELECT
    MAX(setting) FILTER (WHERE name = 'max_connections')::integer AS max_connections,
    COALESCE(MAX(setting) FILTER (WHERE name = 'superuser_reserved_connections'), '0')::integer
      AS superuser_reserved_connections,
    COALESCE(MAX(setting) FILTER (WHERE name = 'reserved_connections'), '0')::integer
      AS reserved_connections
  FROM pg_settings
  WHERE name IN (
    'max_connections',
    'superuser_reserved_connections',
    'reserved_connections'
  )
),
summary AS (
  SELECT
    COUNT(*)::integer AS visible_activity_rows,
    COUNT(*) FILTER (WHERE backend_type = 'client backend')::integer AS client_backend_count,
    COUNT(*) FILTER (WHERE backend_type IS DISTINCT FROM 'client backend')::integer
      AS non_client_backend_count,
    COUNT(*) FILTER (WHERE backend_type = 'client backend' AND state = 'active')::integer
      AS active_client_count,
    COUNT(*) FILTER (WHERE backend_type = 'client backend' AND state = 'idle')::integer
      AS idle_client_count,
    COUNT(*) FILTER (WHERE backend_type = 'client backend' AND state = 'idle in transaction')::integer
      AS idle_in_transaction_client_count
  FROM pg_stat_activity
),
buckets AS (
  SELECT
    COALESCE(backend_type, '<unknown>') AS backend_type,
    COALESCE(datname, '<no database>') AS database_name,
    COALESCE(application_name, '<empty>') AS application_name,
    COALESCE(client_addr::text, 'LOCAL') AS client_addr,
    COALESCE(state, '<no state>') AS state,
    COUNT(*)::integer AS connections
  FROM pg_stat_activity
  GROUP BY backend_type, datname, application_name, client_addr, state
)
SELECT
  clock_timestamp() AS captured_at,
  settings.max_connections,
  settings.superuser_reserved_connections,
  settings.reserved_connections,
  summary.visible_activity_rows,
  summary.client_backend_count,
  summary.non_client_backend_count,
  summary.active_client_count,
  summary.idle_client_count,
  summary.idle_in_transaction_client_count,
  ROUND(100.0 * summary.client_backend_count / NULLIF(settings.max_connections, 0), 2)
    AS client_usage_percent_of_max,
  buckets.backend_type,
  buckets.database_name,
  buckets.application_name,
  buckets.client_addr,
  buckets.state,
  buckets.connections
FROM buckets
CROSS JOIN settings
CROSS JOIN summary
ORDER BY
  CASE WHEN buckets.backend_type = 'client backend' THEN 0 ELSE 1 END,
  buckets.connections DESC,
  buckets.application_name,
  buckets.client_addr;
