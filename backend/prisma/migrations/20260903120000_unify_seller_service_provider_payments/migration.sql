-- UNIFY-PAYMENTS
-- Seller and service-provider payment methods were two independent
-- Json? arrays (seller_profiles.paymentMethods and
-- service_provider_details.paymentMethods) that the frontend had to
-- merge/dedup by hand at display time (PublicProfileHeader's pushAll
-- logic). Since a ServiceProviderDetails row always hangs off exactly
-- one SellerProfile (sellerProfileId is @unique), there is no real
-- reason for two separate lists — this migration folds any
-- service-provider-only entries into the parent seller profile, then
-- drops the now-redundant column so paymentMethods has a single
-- source of truth going forward (managed only from the seller's own
-- profile page).
--
-- Merge rule: entries are de-duplicated by (kind, accountNumber). The
-- seller's own existing entries win on a collision (priority 0) over
-- the service-provider's copy of the same entry (priority 1) — in
-- practice these are almost always identical duplicates anyway, since
-- until now both editors wrote the same shape of data.
--
-- FIX (malformed-entry safety): only elements that actually have both
-- a non-null "kind" and a non-empty "accountNumber" are considered for
-- the merge — matches the same validity check the frontend's
-- normalizePaymentMethods() already applies (accountNumber required,
-- else discarded). Without this filter, two different malformed
-- entries (e.g. both missing accountNumber) would both key to
-- (NULL, NULL) under DISTINCT ON and silently collapse into one,
-- losing the other. A malformed entry was never valid/displayable
-- data to begin with, so it's dropped here rather than merged —
-- explicit filtering, not an accidental side effect of the dedup.

WITH merged AS (
  SELECT
    sp."id" AS seller_profile_id,
    (
      SELECT jsonb_agg(deduped.elem)
      FROM (
        SELECT DISTINCT ON (combined.elem->>'kind', combined.elem->>'accountNumber')
          combined.elem
        FROM (
          SELECT elem, 0 AS priority
          FROM jsonb_array_elements(COALESCE(sp."paymentMethods", '[]'::jsonb)) AS elem
          UNION ALL
          SELECT elem, 1 AS priority
          FROM jsonb_array_elements(COALESCE(spd."paymentMethods", '[]'::jsonb)) AS elem
        ) combined
        WHERE combined.elem ? 'kind'
          AND combined.elem ? 'accountNumber'
          AND trim(both from (combined.elem->>'accountNumber')) <> ''
        ORDER BY combined.elem->>'kind', combined.elem->>'accountNumber', combined.priority ASC
      ) deduped
    ) AS merged_methods
  FROM "seller_profiles" sp
  JOIN "service_provider_details" spd ON spd."sellerProfileId" = sp."id"
  WHERE spd."paymentMethods" IS NOT NULL
    AND jsonb_array_length(spd."paymentMethods") > 0
)
UPDATE "seller_profiles" sp
SET "paymentMethods" = COALESCE(merged.merged_methods, sp."paymentMethods", '[]'::jsonb)
FROM merged
WHERE sp."id" = merged.seller_profile_id;

ALTER TABLE "service_provider_details" DROP COLUMN IF EXISTS "paymentMethods";
