-- Supports the bounded notification-retention scan by createdAt while keeping
-- unread notifications out of the index. The query also checks the unique
-- notificationId index on notification_push_dispatches before deleting rows.
--
-- CONCURRENTLY avoids blocking normal notification inserts/reads during the
-- index build. PostgreSQL does not allow CREATE INDEX CONCURRENTLY in a
-- transaction block; apply this migration with a migration runner that does
-- not wrap this statement in an explicit transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notifications_read_retention_idx"
  ON "notifications" ("createdAt", "id")
  WHERE "readAt" IS NOT NULL;
