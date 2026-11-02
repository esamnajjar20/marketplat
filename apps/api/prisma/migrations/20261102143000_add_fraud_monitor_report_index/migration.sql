-- Supports the bounded abuse-pattern scan over recent pending reports.
-- Concurrent creation avoids blocking report submission while the index builds.
-- If an interrupted build leaves an invalid index, drop it concurrently before retrying.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "reports_status_created_at_idx"
  ON "reports" ("status", "createdAt");
