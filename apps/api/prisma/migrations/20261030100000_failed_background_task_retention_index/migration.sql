-- Supports the bounded resolvedAt-based retention query without indexing
-- unresolved records or increasing index maintenance for the active backlog.
-- CREATE INDEX CONCURRENTLY avoids blocking regular writes during the build.
-- If an interrupted prior attempt leaves this index present but invalid, drop
-- that invalid index with DROP INDEX CONCURRENTLY before retrying this migration.
-- Prisma 5.22 cannot represent partial indexes in schema.prisma; keep this
-- index in migration SQL and verify indisvalid after deployment.
CREATE INDEX CONCURRENTLY "failed_background_tasks_resolved_retention_idx"
ON "failed_background_tasks" ("resolvedAt", "id")
WHERE "resolved" = TRUE
  AND "resolvedAt" IS NOT NULL;
