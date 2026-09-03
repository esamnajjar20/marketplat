-- UNIFY-PAYMENTS-STORES
-- Same duplicated-state problem as 20260903120000's
-- seller/service-provider unification, now applied to stores: seller
-- and store payment methods were two independent Json? arrays
-- (seller_profiles.paymentMethods and store_details.paymentMethods)
-- that the frontend had to merge/dedup by hand at display time. Since
-- a StoreDetails row always hangs off exactly one SellerProfile
-- (sellerProfileId is @unique), there is no real reason for two
-- separate lists — this migration folds any store-only entries into
-- the parent seller profile, then drops the now-redundant column so
-- paymentMethods has a single source of truth going forward (managed
-- only from the seller's own profile page).
--
-- Merge rule: identical to 20260903120000 — entries de-duplicated by
-- (kind, accountNumber), seller's own existing entries win on a
-- collision (priority 0) over the store's copy (priority 1).
--
-- FIX (malformed-entry safety): same filter as 20260903120000 — only
-- elements with a non-null "kind" and a non-empty "accountNumber" are
-- considered for the merge, so two different malformed entries can't
-- silently collapse into one under DISTINCT ON.

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
          FROM jsonb_array_elements(COALESCE(sd."paymentMethods", '[]'::jsonb)) AS elem
        ) combined
        WHERE combined.elem ? 'kind'
          AND combined.elem ? 'accountNumber'
          AND trim(both from (combined.elem->>'accountNumber')) <> ''
        ORDER BY combined.elem->>'kind', combined.elem->>'accountNumber', combined.priority ASC
      ) deduped
    ) AS merged_methods
  FROM "seller_profiles" sp
  JOIN "store_details" sd ON sd."sellerProfileId" = sp."id"
  WHERE sd."paymentMethods" IS NOT NULL
    AND jsonb_array_length(sd."paymentMethods") > 0
)
UPDATE "seller_profiles" sp
SET "paymentMethods" = COALESCE(merged.merged_methods, sp."paymentMethods", '[]'::jsonb)
FROM merged
WHERE sp."id" = merged.seller_profile_id;

ALTER TABLE "store_details" DROP COLUMN IF EXISTS "paymentMethods";
