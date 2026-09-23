-- T452 — idempotency key for user_activities writes.
--
-- activityBuffer.ts buffers activity writes in Redis and drains them
-- to Postgres via createMany() on a timer. On a createMany failure the
-- buffer re-pushes the same serialized entries for retry. If the
-- failure was actually "the INSERT committed but the response was
-- lost" (network blip, process restart between DB COMMIT and client
-- ACK), the retry inserts duplicates. This column + its unique index
-- + skipDuplicates:true on the createMany call makes that retry path
-- a no-op.
--
-- Nullable because every pre-existing row (written before this
-- migration) has no key — Postgres treats multiple NULLs as
-- non-conflicting in a unique index, so the backfill is unnecessary.
ALTER TABLE "user_activities" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "user_activities_idempotencyKey_key"
  ON "user_activities"("idempotencyKey");
