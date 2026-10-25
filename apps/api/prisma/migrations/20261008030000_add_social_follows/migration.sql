-- Social follow graph: people, stores and marketplace categories.
CREATE TYPE "FollowTargetType" AS ENUM ('USER', 'STORE', 'CATEGORY');

CREATE TABLE "follows" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "targetType" "FollowTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "follows_followerId_targetType_targetId_key"
    ON "follows"("followerId", "targetType", "targetId");
CREATE INDEX "follows_targetType_targetId_idx"
    ON "follows"("targetType", "targetId");
CREATE INDEX "follows_followerId_createdAt_idx"
    ON "follows"("followerId", "createdAt");

ALTER TABLE "follows"
  ADD CONSTRAINT "follows_followerId_fkey"
  FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the existing store-follow graph into the new unified graph.
INSERT INTO "follows" ("id", "followerId", "targetType", "targetId", "createdAt")
SELECT 'store_follow_' || sf."id", sf."userId", 'STORE'::"FollowTargetType", sf."storeId", sf."createdAt"
FROM "store_followers" sf
ON CONFLICT ("followerId", "targetType", "targetId") DO NOTHING;

-- Existing accounts keep their previous notification behavior; the new
-- preference is opt-out and therefore defaults to true for legacy users.
UPDATE "users"
SET "notificationPreferences" = jsonb_set(
  COALESCE("notificationPreferences"::jsonb, '{}'::jsonb),
  '{followUpdates}',
  'true'::jsonb,
  true
);
