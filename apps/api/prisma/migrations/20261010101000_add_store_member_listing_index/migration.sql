-- Supports GET /stores/me/members pagination/filtering and stable ordering.
CREATE INDEX IF NOT EXISTS "store_members_storeId_status_createdAt_idx" ON "store_members"("storeId", "status", "createdAt");
