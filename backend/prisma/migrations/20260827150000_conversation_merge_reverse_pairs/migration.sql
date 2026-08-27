-- Merge reverse-direction conversation pairs that accumulated while
-- @@unique([buyerId, sellerId]) only covered one ordering.
-- Prefer the row whose sellerId matches the linked ad's owner (semantic
-- seller); otherwise keep the older row (smaller id).
-- Does NOT rewrite buyerId/sellerId on surviving rows — those columns
-- keep initiator/owner meaning for response-metrics jobs.

WITH pairs AS (
  SELECT
    a.id AS id_a,
    b.id AS id_b,
    a."sellerId" AS seller_a,
    b."sellerId" AS seller_b,
    a."adId" AS ad_a,
    b."adId" AS ad_b
  FROM conversations a
  JOIN conversations b
    ON a."buyerId" = b."sellerId"
   AND a."sellerId" = b."buyerId"
   AND a.id < b.id
),
resolved AS (
  SELECT
    p.id_a,
    p.id_b,
    CASE
      WHEN p.ad_a IS NOT NULL AND EXISTS (
        SELECT 1 FROM ads ad WHERE ad.id = p.ad_a AND ad."userId" = p.seller_a
      ) THEN p.id_a
      WHEN p.ad_b IS NOT NULL AND EXISTS (
        SELECT 1 FROM ads ad WHERE ad.id = p.ad_b AND ad."userId" = p.seller_b
      ) THEN p.id_b
      ELSE p.id_a
    END AS keep_id,
    CASE
      WHEN p.ad_a IS NOT NULL AND EXISTS (
        SELECT 1 FROM ads ad WHERE ad.id = p.ad_a AND ad."userId" = p.seller_a
      ) THEN p.id_b
      WHEN p.ad_b IS NOT NULL AND EXISTS (
        SELECT 1 FROM ads ad WHERE ad.id = p.ad_b AND ad."userId" = p.seller_b
      ) THEN p.id_a
      ELSE p.id_b
    END AS drop_id
  FROM pairs p
)
UPDATE messages m
SET "conversationId" = r.keep_id
FROM resolved r
WHERE m."conversationId" = r.drop_id
  AND NOT EXISTS (
    SELECT 1 FROM messages x
    WHERE x.id = m.id AND x."conversationId" = r.keep_id
  );

WITH pairs AS (
  SELECT
    a.id AS id_a,
    b.id AS id_b,
    a."sellerId" AS seller_a,
    b."sellerId" AS seller_b,
    a."adId" AS ad_a,
    b."adId" AS ad_b
  FROM conversations a
  JOIN conversations b
    ON a."buyerId" = b."sellerId"
   AND a."sellerId" = b."buyerId"
   AND a.id < b.id
),
resolved AS (
  SELECT
    CASE
      WHEN p.ad_a IS NOT NULL AND EXISTS (
        SELECT 1 FROM ads ad WHERE ad.id = p.ad_a AND ad."userId" = p.seller_a
      ) THEN p.id_a
      WHEN p.ad_b IS NOT NULL AND EXISTS (
        SELECT 1 FROM ads ad WHERE ad.id = p.ad_b AND ad."userId" = p.seller_b
      ) THEN p.id_b
      ELSE p.id_a
    END AS keep_id,
    CASE
      WHEN p.ad_a IS NOT NULL AND EXISTS (
        SELECT 1 FROM ads ad WHERE ad.id = p.ad_a AND ad."userId" = p.seller_a
      ) THEN p.id_b
      WHEN p.ad_b IS NOT NULL AND EXISTS (
        SELECT 1 FROM ads ad WHERE ad.id = p.ad_b AND ad."userId" = p.seller_b
      ) THEN p.id_a
      ELSE p.id_b
    END AS drop_id
  FROM pairs p
)
DELETE FROM conversations
WHERE id IN (SELECT drop_id FROM resolved);
