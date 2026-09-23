import { Promotion, Product } from '@prisma/client';
import { promotionsRepository } from './promotions.repository';
import { productsRepository } from '../products/products.repository';
import { requireOwnStoreForProducts } from '../stores/stores.service';
import { CreatePromotionInput, UpdatePromotionInput } from './promotions.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { ConflictError } from '../../shared/errors/ConflictError';

// PROMO-1: status is derived from (startsAt, endsAt, now) rather than
// trusted from whatever was last written — a promotion created with a
// future startsAt is SCHEDULED at creation time and should read as
// ACTIVE once that time passes, with no separate write required for
// every promotion on every clock tick. resolveStatus is called on
// every read/write path (so an individual product's price is always
// correct even between sweeps), and — as of Phase 14 —
// myPromotionsExpiring.ts also runs promotionsRepository's
// findDueForActivation/findDueForExpiry as a scheduled sweep (same
// invocation model as weeklyAdViewsReport.ts) so the stored `status`
// column itself gets corrected on a schedule too, not just read
// lazily; see that script for the full status-transition + lifecycle-
// notification logic.
const resolveStatus = (promotion: Promotion, now: Date): Promotion['status'] => {
  if (promotion.status === 'CANCELLED' || promotion.status === 'DRAFT') return promotion.status;
  if (promotion.maxUses !== null && promotion.usageCount >= promotion.maxUses) return 'EXPIRED';
  if (now < promotion.startsAt) return 'SCHEDULED';
  if (now >= promotion.endsAt) return 'EXPIRED';
  return 'ACTIVE';
};

// PROMO-1: keeps the DB row's status column reasonably fresh whenever
// it's read, without a background job. Fire-and-forget — a failed
// write here must never fail the read it's attached to, same
// convention as productsService.getProductById's incrementViews.
const syncStatus = (promotion: Promotion, now: Date): Promotion => {
  const resolved = resolveStatus(promotion, now);
  if (resolved !== promotion.status) {
    promotionsRepository.update(promotion.id, { status: resolved }).catch(() => undefined);
    return { ...promotion, status: resolved };
  }
  return promotion;
};

const requireOwnPromotion = async (userId: string, id: string): Promise<Promotion> => {
  const store = await requireOwnStoreForProducts(userId);
  const promotion = await promotionsRepository.findById(id);
  if (!promotion) throw new NotFoundError('Promotion not found', 'PROMOTION_NOT_FOUND');
  if (promotion.storeId !== store.id) {
    throw new ForbiddenError('You do not own this promotion.', 'NOT_YOUR_PROMOTION');
  }
  return promotion;
};

export type EffectivePrice = {
  price: number;
  originalPrice: number;
  discountPrice: number | null;
  discountPercentage: number | null;
  hasActivePromotion: boolean;
  activePromotionId: string | null;
};

// PROMO-1: single source of truth for "what does this product actually
// cost right now" — see the design discussion this module was built
// from: an ACTIVE-and-in-window Promotion always wins over the older
// static Product.discountPrice column, which remains the fallback for
// products that never adopt Promotion. Never both at once.
const computeEffectivePrice = (product: Product, promotion: Promotion | null): EffectivePrice => {
  const price = Number(product.price);

  if (promotion) {
    const resolved = resolveStatus(promotion, new Date());
    if (resolved === 'ACTIVE') {
      const discountValue = Number(promotion.discountValue);
      const discounted =
        promotion.discountType === 'PERCENTAGE'
          ? price * (1 - discountValue / 100)
          : Math.max(price - discountValue, 0);
      const rounded = Math.round(discounted * 100) / 100;
      const percentage =
        promotion.discountType === 'PERCENTAGE'
          ? discountValue
          : Math.round((1 - rounded / price) * 100);
      return {
        price,
        originalPrice: price,
        discountPrice: rounded,
        discountPercentage: percentage,
        hasActivePromotion: true,
        activePromotionId: promotion.id,
      };
    }
  }

  const staticDiscount = product.discountPrice !== null ? Number(product.discountPrice) : null;
  return {
    price,
    originalPrice: price,
    discountPrice: staticDiscount,
    discountPercentage:
      staticDiscount !== null ? Math.round((1 - staticDiscount / price) * 100) : null,
    hasActivePromotion: false,
    activePromotionId: null,
  };
};

export const promotionsService = {
  createPromotion: async (userId: string, input: CreatePromotionInput): Promise<Promotion> => {
    const store = await requireOwnStoreForProducts(userId);

    const product = await productsRepository.findById(input.productId);
    if (!product || product.status === 'DELETED') {
      throw new NotFoundError('Product not found', 'PRODUCT_NOT_FOUND');
    }
    if (product.storeId !== store.id) {
      throw new ForbiddenError('You do not own this product.', 'NOT_YOUR_PRODUCT');
    }

    const now = new Date();
    const status: Promotion['status'] = input.startsAt <= now ? 'ACTIVE' : 'SCHEDULED';

    try {
      return await promotionsRepository.create({
        storeId: store.id,
        productId: input.productId,
        title: input.title,
        description: input.description,
        discountType: input.discountType,
        discountValue: input.discountValue,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status,
        maxUses: input.maxUses,
      });
    } catch (error) {
      // PROMO-1: the partial unique index (promotions_one_live_per_
      // product_key, see its migration) is what actually prevents two
      // concurrent requests from both creating a live promotion for
      // the same product — this catch turns that DB-level rejection
      // into the same 409 a pre-check would have produced for the
      // non-racing case, rather than leaking a raw Prisma error.
      if (promotionsRepository.isUniqueConstraintError(error)) {
        throw new ConflictError(
          'This product already has an active or scheduled promotion.',
          'PROMOTION_ALREADY_LIVE'
        );
      }
      throw error;
    }
  },

  getStorePromotions: async (userId: string): Promise<Promotion[]> => {
    const store = await requireOwnStoreForProducts(userId);
    const promotions = await promotionsRepository.findByStoreId(store.id);
    const now = new Date();
    return promotions.map(p => syncStatus(p, now));
  },

  getPromotionById: async (userId: string, id: string): Promise<Promotion> => {
    const promotion = await requireOwnPromotion(userId, id);
    return syncStatus(promotion, new Date());
  },

  updatePromotion: async (
    userId: string,
    id: string,
    input: UpdatePromotionInput
  ): Promise<Promotion> => {
    const existing = await requireOwnPromotion(userId, id);

    // T384 — cross-field consistency: validation only sees the request
    // body, so a caller flipping discountType alone (FIXED→PERCENTAGE)
    // would keep a stale discountValue (e.g. 500) that violates the
    // PERCENTAGE<=100 rule. Resolve the would-be final values and
    // enforce the constraint here, where both old and new are visible.
    const nextType = input.discountType ?? existing.discountType;
    const nextValue =
      input.discountValue !== undefined
        ? Number(input.discountValue)
        : Number(existing.discountValue);
    if (nextType === 'PERCENTAGE' && nextValue > 100) {
      throw new ConflictError(
        'A percentage discount cannot exceed 100.',
        'INVALID_DISCOUNT_VALUE',
      );
    }

    // T386 — window consistency: same class of bug as T384. If either
    // bound moves, the resulting (startsAt, endsAt) pair must stay
    // ordered; the schema only catches the case where both are supplied.
    const nextStartsAt = input.startsAt ?? existing.startsAt;
    const nextEndsAt = input.endsAt ?? existing.endsAt;
    if (nextEndsAt <= nextStartsAt) {
      throw new ConflictError(
        'endsAt must be after startsAt.',
        'INVALID_PROMOTION_WINDOW',
      );
    }

    // T385 — the caller can move startsAt/endsAt across "now" in a
    // single PATCH; the pre-existing row's stored status is stale the
    // instant that happens. Re-derive status from the merged values
    // rather than trusting whatever was last written.
    const now = new Date();
    const resolvedStatus = resolveStatus(
      { ...existing, startsAt: nextStartsAt, endsAt: nextEndsAt },
      now,
    );

    const patch: Parameters<typeof promotionsRepository.update>[1] = { ...input };
    // A client may only ever request CANCELLED (enforced by the schema);
    // for any non-cancel update, the derived status must win over the
    // stored one so the returned row is truthful.
    if (input.status !== 'CANCELLED') {
      patch.status = resolvedStatus;
    }

    const updated = await promotionsRepository.update(id, patch);
    return syncStatus(updated, now);
  },

  cancelPromotion: async (userId: string, id: string): Promise<void> => {
    await requireOwnPromotion(userId, id);
    await promotionsRepository.cancel(id);
  },

  // Used by products.service.ts to fold the live promotion (if any)
  // into a single product's API response — see EffectivePrice.
  getEffectivePrice: async (product: Product): Promise<EffectivePrice> => {
    const promotion = await promotionsRepository.findLiveByProductId(product.id);
    return computeEffectivePrice(product, promotion);
  },

  // Batch variant for list endpoints (getProducts) — one query for all
  // live promotions across the page instead of N+1.
  getEffectivePrices: async (products: Product[]): Promise<Map<string, EffectivePrice>> => {
    const promotions = await promotionsRepository.findLiveByProductIds(products.map(p => p.id));
    const byProductId = new Map(promotions.map(p => [p.productId, p]));
    return new Map(
      products.map(product => [
        product.id,
        computeEffectivePrice(product, byProductId.get(product.id) ?? null),
      ])
    );
  },
};
