-- Restores the index on favorites."listId" that 20260917121810 dropped as schema drift
-- (it existed in SQL but was not declared in schema.prisma; now declared as @@index([listId])).
-- Needed because favorites.listId has ON DELETE SET NULL: deleting a favorite list
-- otherwise sequentially scans the whole favorites table.
-- Additive and online: no table rewrite, no lock that blocks writes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "favorites_listId_idx"
  ON "favorites" ("listId");
