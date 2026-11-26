-- OPTIONAL: requires pg_stat_statements to be installed and permission to read it.
-- This query returns normalized SQL text; review it privately before sharing because
-- query literals may still reveal sensitive schema/business information.
SELECT
  calls,
  ROUND(total_exec_time::numeric, 2) AS total_exec_ms,
  ROUND(mean_exec_time::numeric, 2) AS mean_exec_ms,
  ROUND(min_exec_time::numeric, 2) AS min_exec_ms,
  ROUND(max_exec_time::numeric, 2) AS max_exec_ms,
  rows,
  shared_blks_hit,
  shared_blks_read,
  temp_blks_written,
  LEFT(query, 300) AS normalized_query_sample
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 30;
