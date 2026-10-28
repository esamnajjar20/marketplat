/**
 * Promotion types — maps to backend's Promotion Prisma model
 * (backend/src/modules/promotions). Verified directly against
 * promotions.controller.ts / promotions.validation.ts / schema.prisma.
 *
 * A Promotion always belongs to both a StoreDetails and a Product
 * (one live promotion per product at a time — enforced by a partial
 * unique DB index, see that model's migration). See product.types.ts's
 * EffectivePrice for how a live Promotion is folded into a Product's
 * public price fields.
 */

export type DiscountType = 'PERCENTAGE' | 'FIXED_AMOUNT';
export type PromotionStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

export interface Promotion {
  id: string;
  storeId: string;
  productId: string;
  title: string;
  description: string | null;
  discountType: DiscountType;
  /** Prisma Decimal(10,2) — string in JSON, same convention as Product.price. */
  discountValue: string;
  startsAt: string;
  endsAt: string;
  status: PromotionStatus;
  maxUses: number | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Payloads ─────────────────────────────────────────────────────

/** POST /promotions — JSON body. */
export interface CreatePromotionPayload {
  productId: string;
  title: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  /** ISO datetime string. */
  startsAt: string;
  /** ISO datetime string. */
  endsAt: string;
  maxUses?: number;
}

/**
 * PATCH /promotions/:id — status may only be set to CANCELLED here;
 * every other status transition (SCHEDULED -> ACTIVE -> EXPIRED) is
 * derived server-side from startsAt/endsAt, never chosen by the client
 * (see backend's promotions.validation.ts updatePromotionSchema).
 */
export interface UpdatePromotionPayload {
  title?: string;
  description?: string | null;
  discountType?: DiscountType;
  discountValue?: number;
  startsAt?: string;
  endsAt?: string;
  maxUses?: number | null;
  status?: 'CANCELLED';
}
