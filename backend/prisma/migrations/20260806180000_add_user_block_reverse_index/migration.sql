-- AUDIT-FIX 1.6: existsEitherDirection queries both
-- (blockerId=A AND blockedId=B) and (blockerId=B AND blockedId=A).
-- The existing @@unique([blockerId, blockedId]) covers the first
-- perfectly; this composite index gives the second the same
-- index-only lookup instead of relying on the single-column
-- @@index([blockedId]) alone.
CREATE INDEX IF NOT EXISTS "user_blocks_blockedId_blockerId_idx"
  ON "user_blocks" ("blockedId", "blockerId");
