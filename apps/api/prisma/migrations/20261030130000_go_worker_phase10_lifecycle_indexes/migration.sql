-- Phase 10: ordered partial indexes for the Go-first promotion lifecycle sweep.
-- CREATE INDEX CONCURRENTLY avoids blocking seller/admin writes while the
-- candidate indexes are built. Prisma migrations must run without an explicit
-- transaction for these statements. If an interrupted build leaves an invalid
-- index, drop that invalid index concurrently before retrying this migration.
-- The same predicates are used by the Express fallback SQL.

CREATE INDEX CONCURRENTLY IF NOT EXISTS "promotions_scheduled_startsAt_id_idx"
    ON "promotions"("startsAt", "id")
    WHERE "status" = 'SCHEDULED';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "promotions_active_endsAt_id_idx"
    ON "promotions"("endsAt", "id")
    WHERE "status" = 'ACTIVE';

CREATE INDEX CONCURRENTLY IF NOT EXISTS "promotions_active_unwarned_endsAt_id_idx"
    ON "promotions"("endsAt", "id")
    WHERE "status" = 'ACTIVE' AND "expiryWarnedAt" IS NULL;
