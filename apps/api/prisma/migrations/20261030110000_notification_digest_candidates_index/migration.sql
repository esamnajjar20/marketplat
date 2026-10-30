-- Keeps the digest worker's unread-candidate scan bounded to the five
-- low-priority notification types it is allowed to consolidate.
-- The partial predicate avoids indexing critical notifications and read rows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "notification_digest_candidates_idx"
ON "notifications" ("userId", "createdAt", "id")
INCLUDE ("type")
WHERE "readAt" IS NULL
  AND "type" IN (
    'PROMOTION',
    'SAVED_SEARCH_MATCH',
    'STORE_NEW_PRODUCT',
    'STORE_PROMOTION_STARTED',
    'STORE_PRODUCT_RESTOCKED'
  )
  AND "data"->'digest' IS DISTINCT FROM 'true'::jsonb;
