-- All reconciliation and constraint changes are atomic.
BEGIN;

-- Database integrity and query-access-path hardening.
-- This migration is intentionally fail-fast if pre-existing appointment rows
-- violate the new invariants; it does not silently delete or reschedule data.

-- Prevent opposite-direction creates and concurrent child-row writes while
-- duplicate conversations, messages, and per-user settings are consolidated.
-- Run in a controlled deployment window with conversation writes quiesced.
LOCK TABLE "messages", "conversation_user_settings", "conversations"
  IN SHARE ROW EXCLUSIVE MODE;

-- 1) Merge conversations by unordered participant pair before enforcing the
-- expression-based unique index. The oldest conversation remains canonical;
-- all messages and participant settings are moved to it. Secondary context
-- (additional ad/request IDs and JSON contexts) is retained in canonical JSON.
WITH ranked AS (
  SELECT
    id,
    "buyerId",
    "sellerId",
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY LEAST("buyerId", "sellerId"), GREATEST("buyerId", "sellerId")
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY LEAST("buyerId", "sellerId"), GREATEST("buyerId", "sellerId")
      ORDER BY "createdAt" ASC, id ASC
    ) AS canonical_id
  FROM "conversations"
), duplicate_map AS (
  SELECT id AS duplicate_id, canonical_id
  FROM ranked
  WHERE rn > 1
)
UPDATE "messages" AS message
SET "conversationId" = duplicate_map.canonical_id
FROM duplicate_map
WHERE message."conversationId" = duplicate_map.duplicate_id;

-- Preserve per-user settings. When both rows exist, retain the latest active
-- state for each timestamp field rather than discarding either participant's
-- pin/archive/delete/mute preference.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY LEAST("buyerId", "sellerId"), GREATEST("buyerId", "sellerId")
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY LEAST("buyerId", "sellerId"), GREATEST("buyerId", "sellerId")
      ORDER BY "createdAt" ASC, id ASC
    ) AS canonical_id
  FROM "conversations"
), duplicate_map AS (
  SELECT id AS duplicate_id, canonical_id FROM ranked WHERE rn > 1
)
INSERT INTO "conversation_user_settings" (
  "id", "conversationId", "userId", "pinnedAt", "archivedAt", "deletedAt",
  "mutedUntil", "createdAt", "updatedAt"
)
SELECT
  'merged_' || settings."id", duplicate_map.canonical_id, settings."userId", settings."pinnedAt",
  settings."archivedAt", settings."deletedAt", settings."mutedUntil",
  settings."createdAt", settings."updatedAt"
FROM "conversation_user_settings" AS settings
JOIN duplicate_map ON duplicate_map.duplicate_id = settings."conversationId"
ON CONFLICT ("conversationId", "userId") DO UPDATE SET
  "pinnedAt" = CASE
    WHEN "conversation_user_settings"."pinnedAt" IS NULL THEN EXCLUDED."pinnedAt"
    WHEN EXCLUDED."pinnedAt" IS NULL THEN "conversation_user_settings"."pinnedAt"
    ELSE GREATEST("conversation_user_settings"."pinnedAt", EXCLUDED."pinnedAt") END,
  "archivedAt" = CASE
    WHEN "conversation_user_settings"."archivedAt" IS NULL THEN EXCLUDED."archivedAt"
    WHEN EXCLUDED."archivedAt" IS NULL THEN "conversation_user_settings"."archivedAt"
    ELSE GREATEST("conversation_user_settings"."archivedAt", EXCLUDED."archivedAt") END,
  "deletedAt" = CASE
    WHEN "conversation_user_settings"."deletedAt" IS NULL THEN EXCLUDED."deletedAt"
    WHEN EXCLUDED."deletedAt" IS NULL THEN "conversation_user_settings"."deletedAt"
    ELSE GREATEST("conversation_user_settings"."deletedAt", EXCLUDED."deletedAt") END,
  "mutedUntil" = CASE
    WHEN "conversation_user_settings"."mutedUntil" IS NULL THEN EXCLUDED."mutedUntil"
    WHEN EXCLUDED."mutedUntil" IS NULL THEN "conversation_user_settings"."mutedUntil"
    ELSE GREATEST("conversation_user_settings"."mutedUntil", EXCLUDED."mutedUntil") END,
  "updatedAt" = GREATEST("conversation_user_settings"."updatedAt", EXCLUDED."updatedAt");

-- Carry secondary context into the surviving conversation. Conversation JSON
-- remains an object; existing user-authored keys take precedence.
WITH ranked AS (
  SELECT
    id, "adId", "serviceRequestId", context,
    ROW_NUMBER() OVER (
      PARTITION BY LEAST("buyerId", "sellerId"), GREATEST("buyerId", "sellerId")
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY LEAST("buyerId", "sellerId"), GREATEST("buyerId", "sellerId")
      ORDER BY "createdAt" ASC, id ASC
    ) AS canonical_id
  FROM "conversations"
), grouped AS (
  SELECT
    canonical_id,
    ARRAY_REMOVE(ARRAY_AGG(id ORDER BY id) FILTER (WHERE rn > 1), NULL) AS merged_ids,
    ARRAY_REMOVE(ARRAY_AGG("adId" ORDER BY id) FILTER (WHERE rn > 1 AND "adId" IS NOT NULL), NULL) AS merged_ad_ids,
    ARRAY_REMOVE(ARRAY_AGG("serviceRequestId" ORDER BY id) FILTER (WHERE rn > 1 AND "serviceRequestId" IS NOT NULL), NULL) AS merged_request_ids,
    JSONB_AGG(context ORDER BY id) FILTER (WHERE rn > 1 AND context IS NOT NULL) AS merged_contexts
  FROM ranked
  GROUP BY canonical_id
)
UPDATE "conversations" AS canonical
SET
  "adId" = COALESCE(canonical."adId", (
    SELECT dup."adId" FROM "conversations" dup
    JOIN grouped g ON g.canonical_id = canonical.id
    WHERE dup.id = ANY(g.merged_ids) AND dup."adId" IS NOT NULL
    ORDER BY dup."createdAt" ASC, dup.id ASC LIMIT 1
  )),
  "serviceRequestId" = COALESCE(canonical."serviceRequestId", (
    SELECT dup."serviceRequestId" FROM "conversations" dup
    JOIN grouped g ON g.canonical_id = canonical.id
    WHERE dup.id = ANY(g.merged_ids) AND dup."serviceRequestId" IS NOT NULL
    ORDER BY dup."createdAt" ASC, dup.id ASC LIMIT 1
  )),
  context = CASE
    WHEN canonical.context IS NULL THEN '{}'::jsonb
    WHEN jsonb_typeof(canonical.context::jsonb) = 'object' THEN canonical.context::jsonb
    ELSE jsonb_build_object('_legacyContext', canonical.context::jsonb)
  END || jsonb_build_object(
    '_mergedConversationIds', COALESCE(grouped.merged_ids, ARRAY[]::text[]),
    '_mergedAdIds', COALESCE(grouped.merged_ad_ids, ARRAY[]::text[]),
    '_mergedServiceRequestIds', COALESCE(grouped.merged_request_ids, ARRAY[]::text[]),
    '_mergedContexts', COALESCE(grouped.merged_contexts, '[]'::jsonb)
  )
FROM grouped
WHERE grouped.canonical_id = canonical.id AND cardinality(grouped.merged_ids) > 0;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY LEAST("buyerId", "sellerId"), GREATEST("buyerId", "sellerId")
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "conversations"
)
DELETE FROM "conversations"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS "conversations_unordered_pair_key"
  ON "conversations" (LEAST("buyerId", "sellerId"), GREATEST("buyerId", "sellerId"));

-- Block concurrent appointment writes between the preflight and constraint
-- installation so no conflicting row can slip into the table mid-migration.
LOCK TABLE "appointments" IN SHARE ROW EXCLUSIVE MODE;

-- 2) Appointment intervals: prevent invalid or overlapping scheduled rows at
-- the database boundary, including across Redis lock expiry/restarts.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "appointments"
    WHERE "scheduledEnd" <= "scheduledStart"
  ) THEN
    RAISE EXCEPTION 'Cannot add appointment interval constraints: one or more appointments have scheduledEnd <= scheduledStart';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "appointments" a
    JOIN "appointments" b
      ON a."providerId" = b."providerId"
     AND a.id < b.id
     AND a."status" = 'SCHEDULED'
     AND b."status" = 'SCHEDULED'
     AND tsrange(a."scheduledStart", a."scheduledEnd", '[)') &&
         tsrange(b."scheduledStart", b."scheduledEnd", '[)')
  ) THEN
    RAISE EXCEPTION 'Cannot add appointment exclusion constraint: existing scheduled appointments overlap for a provider';
  END IF;
END $$;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_valid_interval_check"
  CHECK ("scheduledEnd" > "scheduledStart");

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_scheduled_overlap_excl"
  EXCLUDE USING gist (
    "providerId" WITH =,
    tsrange("scheduledStart", "scheduledEnd", '[)') WITH &&
  ) WHERE ("status" = 'SCHEDULED');

-- 3) Preserve inventory audit history if a product is hard-deleted.
ALTER TABLE "stock_movements"
  DROP CONSTRAINT IF EXISTS "stock_movements_productId_fkey";
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4) Indexes matching stable feed/review queries and FK lookups.
CREATE INDEX IF NOT EXISTS "user_activities_userId_createdAt_id_idx"
  ON "user_activities" ("userId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "user_activities_userId_type_createdAt_id_idx"
  ON "user_activities" ("userId", "type", "createdAt", "id");
DROP INDEX IF EXISTS "user_activities_userId_type_createdAt_idx";

CREATE INDEX IF NOT EXISTS "seller_ratings_sellerProfileId_createdAt_id_idx"
  ON "seller_ratings" ("sellerProfileId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "seller_ratings_raterId_idx" ON "seller_ratings" ("raterId");
CREATE INDEX IF NOT EXISTS "seller_ratings_adId_idx" ON "seller_ratings" ("adId");
DROP INDEX IF EXISTS "seller_ratings_sellerProfileId_idx";

CREATE INDEX IF NOT EXISTS "service_reviews_sellerProfileId_createdAt_id_idx"
  ON "service_reviews" ("sellerProfileId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "service_reviews_raterId_idx" ON "service_reviews" ("raterId");
DROP INDEX IF EXISTS "service_reviews_sellerProfileId_idx";

CREATE INDEX IF NOT EXISTS "store_reviews_sellerProfileId_createdAt_id_idx"
  ON "store_reviews" ("sellerProfileId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "store_reviews_raterId_idx" ON "store_reviews" ("raterId");
DROP INDEX IF EXISTS "store_reviews_sellerProfileId_idx";

CREATE INDEX IF NOT EXISTS "notifications_userId_createdAt_id_idx"
  ON "notifications" ("userId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "notifications_userId_readAt_createdAt_id_idx"
  ON "notifications" ("userId", "readAt", "createdAt", "id");
DROP INDEX IF EXISTS "notifications_userId_createdAt_idx";
DROP INDEX IF EXISTS "notifications_userId_readAt_idx";

CREATE INDEX IF NOT EXISTS "favorites_userId_entityType_createdAt_id_idx"
  ON "favorites" ("userId", "entityType", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "favorites_userId_entityType_listId_createdAt_id_idx"
  ON "favorites" ("userId", "entityType", "listId", "createdAt", "id");
CREATE INDEX IF NOT EXISTS "favorites_entityType_entityId_id_idx"
  ON "favorites" ("entityType", "entityId", "id");
DROP INDEX IF EXISTS "favorites_entityType_entityId_idx";

CREATE INDEX IF NOT EXISTS "store_followers_storeId_id_idx"
  ON "store_followers" ("storeId", "id");
DROP INDEX IF EXISTS "store_followers_storeId_idx";
CREATE INDEX IF NOT EXISTS "follows_targetType_targetId_followerId_idx"
  ON "follows" ("targetType", "targetId", "followerId");
DROP INDEX IF EXISTS "follows_targetType_targetId_idx";

CREATE INDEX IF NOT EXISTS "store_members_invitedById_idx" ON "store_members" ("invitedById");
CREATE INDEX IF NOT EXISTS "conversations_adId_idx" ON "conversations" ("adId");

-- Seller cost-product pagination and store-promotion history both order by
-- an updated/created timestamp with a stable id tie-breaker.
CREATE INDEX IF NOT EXISTS "products_storeId_updatedAt_id_idx"
  ON "products" ("storeId", "updatedAt", "id");
DROP INDEX IF EXISTS "promotions_storeId_createdAt_idx";
CREATE INDEX IF NOT EXISTS "promotions_storeId_createdAt_id_idx"
  ON "promotions" ("storeId", "createdAt", "id");

COMMIT;
