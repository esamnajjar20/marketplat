-- FEAT-CONV-DEDUP
-- Collapses Conversation's identity from (adId, buyerId, sellerId) down
-- to (buyerId, sellerId): one thread per pair of users, regardless of
-- which ad it started from. adId stays on the row as initial context
-- only.
--
-- Pre-check used during planning (same-direction duplicates only — see
-- this migration's own note below on the reversed-direction case this
-- does NOT cover):
--
--   SELECT "buyerId", "sellerId", COUNT(*) AS count
--   FROM "conversations"
--   GROUP BY "buyerId", "sellerId"
--   HAVING COUNT(*) > 1;
--
-- Three phases, all in one transaction (Prisma wraps each migration.sql
-- in a transaction by default): (1) re-point every message on a
-- duplicate conversation onto its canonical conversation, (2) delete
-- the now-redundant duplicate conversation rows, (3) drop the old
-- constraint and add the new one. Nothing here deletes a Message row —
-- only Conversation rows that are exact (buyerId, sellerId) duplicates
-- of an older row, and only after every one of their messages has been
-- moved onto the surviving row first.
--
-- NOT covered by this migration: two rows that are duplicates of each
-- other only after swapping buyer/seller (e.g. one row is
-- (buyerId: A, sellerId: B) from A messaging B's ad, another is
-- (buyerId: B, sellerId: A) from B separately messaging A's ad). The
-- app-layer fix (conversations.service.ts) now looks up existing
-- conversations in both directions, so this can no longer happen for
-- any conversation created going forward — but if the current data
-- already contains such a reversed pair, this migration will not merge
-- it (a same-direction (buyerId, sellerId) unique index cannot express
-- that constraint), and the new unique index will accept both rows.
-- Flagged in the rollout report; a follow-up migration can fold these
-- in with a similar canonical-row merge if any are found.

-- Phase 1: re-point messages from every duplicate conversation onto the
-- oldest (canonical) conversation for that (buyerId, sellerId) pair.
WITH ranked AS (
  SELECT
    id,
    "buyerId",
    "sellerId",
    ROW_NUMBER() OVER (
      PARTITION BY "buyerId", "sellerId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "conversations"
),
canonical_map AS (
  SELECT
    dup.id AS duplicate_id,
    canon.id AS canonical_id
  FROM ranked dup
  JOIN ranked canon
    ON dup."buyerId" = canon."buyerId"
   AND dup."sellerId" = canon."sellerId"
   AND canon.rn = 1
  WHERE dup.rn > 1
)
UPDATE "messages" m
SET "conversationId" = cm.canonical_id
FROM canonical_map cm
WHERE m."conversationId" = cm.duplicate_id;

-- Phase 2: delete the now-empty duplicate conversation rows (every
-- message they had was moved in phase 1; nothing else references a
-- conversation by id except messages and, optionally, an inbound
-- serviceRequestId FK, which is itself @unique and therefore cannot be
-- shared between a canonical row and a duplicate — no special handling
-- needed for it here).
WITH ranked AS (
  SELECT
    id,
    "buyerId",
    "sellerId",
    ROW_NUMBER() OVER (
      PARTITION BY "buyerId", "sellerId"
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "conversations"
)
DELETE FROM "conversations"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Phase 3: replace the old composite unique index with the new, narrower
-- one. The original 20260801094751_add_conversations_notifications
-- migration created this as a bare `CREATE UNIQUE INDEX`, not an
-- `ADD CONSTRAINT ... UNIQUE` — Postgres does not register a bare index
-- in pg_constraint, so `DROP CONSTRAINT IF EXISTS` against it would
-- silently no-op (IF EXISTS swallows the "no such constraint" error
-- without ever touching the index). DROP INDEX is the correct statement
-- for something created this way; IF EXISTS / IF NOT EXISTS still make
-- both statements safe to rerun.
DROP INDEX IF EXISTS "conversations_adId_buyerId_sellerId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "conversations_buyerId_sellerId_key" ON "conversations"("buyerId", "sellerId");
