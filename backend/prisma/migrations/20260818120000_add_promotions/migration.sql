-- PROMO-1: introduces the Promotion model — a scheduled/time-boxed
-- discount on a single Product, decoupled from the existing static
-- Product.discountPrice column (kept as-is; see products.service.ts's
-- getEffectivePrice for how the two are reconciled). See schema.prisma's
-- Promotion model doc comment for the full design rationale.

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" VARCHAR(500),
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "maxUses" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotions_storeId_status_idx" ON "promotions"("storeId", "status");

-- CreateIndex
CREATE INDEX "promotions_productId_startsAt_endsAt_idx" ON "promotions"("productId", "startsAt", "endsAt");

-- PROMO-1: MVP business rule — at most one "live" (SCHEDULED or ACTIVE)
-- promotion per product at a time. This is NOT expressible in
-- schema.prisma's DSL (Prisma has no partial-unique-index syntax), so
-- it's hand-authored here, same convention as the
-- add_autocomplete_prefix_indexes migration's partial indexes. This is
-- what actually closes the concurrent-create race: two simultaneous
-- "create promotion for product X" requests can't both insert a second
-- SCHEDULED/ACTIVE row, even if both pass the application-level
-- getActivePromotion() check before either commits. EXPIRED and
-- CANCELLED rows are deliberately excluded from the constraint so
-- promotion history can accumulate freely.
CREATE UNIQUE INDEX "promotions_one_live_per_product_key"
  ON "promotions" ("productId")
  WHERE "status" IN ('SCHEDULED', 'ACTIVE');

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "store_details"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
