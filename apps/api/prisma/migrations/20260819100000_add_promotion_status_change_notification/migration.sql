-- PROMO-1 (Phase 14): adds PROMOTION_STATUS_CHANGE to NotificationType
-- for the myPromotionsExpiring script's lifecycle notifications
-- (started/expiring/expired) — see schema.prisma's doc comment on this
-- enum value for why it's distinct from the existing PROMOTION value.
ALTER TYPE "NotificationType" ADD VALUE 'PROMOTION_STATUS_CHANGE';

-- PROMO-1 (Phase 14): idempotency baseline for the "about to expire"
-- warning — see schema.prisma's Promotion.expiryWarnedAt doc comment.
ALTER TABLE "promotions" ADD COLUMN "expiryWarnedAt" TIMESTAMP(3);
