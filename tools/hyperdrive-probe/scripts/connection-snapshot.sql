-- Read-only PostgreSQL connection snapshot.
-- Run before, during, and immediately after the Hyperdrive benchmark.
-- numbackends is the current number of server backends connected to this database.

SELECT
  current_database() AS database_name,
  clock_timestamp() AS captured_at,
  COALESCE(stats.numbackends, 0)::integer AS current_backend_connections
FROM pg_stat_database AS stats
WHERE stats.datname = current_database();
