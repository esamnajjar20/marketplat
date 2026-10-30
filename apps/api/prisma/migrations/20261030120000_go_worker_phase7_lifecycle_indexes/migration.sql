-- Phase 7 Go-worker lifecycle sweeps.
-- Partial concurrent indexes keep the expiry/demotion scans focused on eligible
-- rows and avoid adding write overhead to unrelated request/ad records.
-- These indexes are intentionally not represented in schema.prisma because
-- Prisma 5.22 does not model partial indexes.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "requests_open_expiry_idx"
  ON "requests" ("expiresAt", "id")
  WHERE "status" = 'OPEN'
    AND "expiresAt" IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "ads_stale_boost_candidates_idx"
  ON "ads" ("updatedAt", "id")
  WHERE "status" = 'ACTIVE'
    AND ("isFeatured" = TRUE OR "isPinned" = TRUE);
