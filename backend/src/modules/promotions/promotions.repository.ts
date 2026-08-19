import { prisma } from '../../config/prisma';
import { Prisma, Promotion, PromotionStatus, DiscountType } from '@prisma/client';

export const promotionsRepository = {
  create: (data: {
    storeId: string;
    productId: string;
    title: string;
    description?: string;
    discountType: DiscountType;
    discountValue: number;
    startsAt: Date;
    endsAt: Date;
    status: PromotionStatus;
    maxUses?: number;
  }): Promise<Promotion> =>
    prisma.promotion.create({
      data: {
        storeId: data.storeId,
        productId: data.productId,
        title: data.title,
        description: data.description,
        discountType: data.discountType,
        discountValue: data.discountValue,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        status: data.status,
        maxUses: data.maxUses,
      },
    }),

  findById: (id: string): Promise<Promotion | null> =>
    prisma.promotion.findUnique({ where: { id } }),

  update: (
    id: string,
    data: Partial<{
      title: string;
      description: string | null;
      discountType: DiscountType;
      discountValue: number;
      startsAt: Date;
      endsAt: Date;
      status: PromotionStatus;
      maxUses: number | null;
    }>
  ): Promise<Promotion> => prisma.promotion.update({ where: { id }, data }),

  // Distinct from a status=CANCELLED update only in naming — kept as
  // its own method (mirrors productsRepository.softDelete) so callers
  // read as intent ("cancel this promotion") rather than a generic
  // field write.
  cancel: (id: string): Promise<Promotion> =>
    prisma.promotion.update({ where: { id }, data: { status: 'CANCELLED' } }),

  findByStoreId: (storeId: string): Promise<Promotion[]> =>
    prisma.promotion.findMany({ where: { storeId }, orderBy: { createdAt: 'desc' } }),

  findByProductId: (productId: string): Promise<Promotion[]> =>
    prisma.promotion.findMany({ where: { productId }, orderBy: { createdAt: 'desc' } }),

  // The single query products.service.ts's getEffectivePrice depends
  // on: the one promotion (if any) currently in its live window for a
  // product. status IN (SCHEDULED, ACTIVE) mirrors the partial unique
  // index's WHERE clause exactly — see that migration's comment — so
  // this can never return more than one row even under concurrent
  // writes.
  findLiveByProductId: (productId: string): Promise<Promotion | null> =>
    prisma.promotion.findFirst({
      where: { productId, status: { in: ['SCHEDULED', 'ACTIVE'] } },
    }),

  findLiveByProductIds: (productIds: string[]): Promise<Promotion[]> =>
    prisma.promotion.findMany({
      where: { productId: { in: productIds }, status: { in: ['SCHEDULED', 'ACTIVE'] } },
    }),

  // Used by the status-transition sweep (previously unscheduled — now
  // run by myPromotionsExpiring.ts, PROMO-1 Phase 14): promotions whose
  // window start/end has passed but whose stored status hasn't caught
  // up yet.
  findDueForActivation: (now: Date): Promise<Promotion[]> =>
    prisma.promotion.findMany({ where: { status: 'SCHEDULED', startsAt: { lte: now } } }),

  findDueForExpiry: (now: Date): Promise<Promotion[]> =>
    prisma.promotion.findMany({ where: { status: 'ACTIVE', endsAt: { lte: now } } }),

  // PROMO-1 (Phase 14): promotions whose window ends within the next
  // `windowHours` and haven't already been warned about it
  // (expiryWarnedAt IS NULL) — see that column's schema.prisma doc
  // comment for the idempotency reasoning. Deliberately excludes rows
  // already past endsAt (those belong to findDueForExpiry above, not
  // this "about to expire" warning).
  findExpiringSoon: (now: Date, windowHours: number): Promise<Promotion[]> => {
    const threshold = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
    return prisma.promotion.findMany({
      where: {
        status: 'ACTIVE',
        endsAt: { gt: now, lte: threshold },
        expiryWarnedAt: null,
      },
    });
  },

  markExpiryWarned: (id: string, at: Date): Promise<Promotion> =>
    prisma.promotion.update({ where: { id }, data: { expiryWarnedAt: at } }),

  updateStatus: (id: string, status: PromotionStatus): Promise<Promotion> =>
    prisma.promotion.update({ where: { id }, data: { status } }),

  incrementUsage: (id: string): Promise<Promotion> =>
    prisma.promotion.update({ where: { id }, data: { usageCount: { increment: 1 } } }),

  isUniqueConstraintError: (error: unknown): boolean =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',
};
