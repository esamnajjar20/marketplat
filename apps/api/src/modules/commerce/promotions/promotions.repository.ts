import { prisma } from '../../../config/prisma';
import { Prisma, Promotion, PromotionStatus, DiscountType } from '@prisma/client';
import { getPaginationParams } from '../../../shared/http/pagination';

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

  /**
   * Compact analytics read: aggregate promotions in the database instead of
   * loading up to 500 full rows just to count active promotions and sum usage.
   * Grouping by status bounds the result to the small PromotionStatus enum.
   */
  getStoreAnalyticsSummary: (storeId: string) =>
    prisma.promotion.groupBy({
      by: ['status'],
      where: { storeId },
      _count: { _all: true },
      _sum: { usageCount: true },
    }),

  findByStoreId: async (
    storeId: string,
    query: { page?: number; limit?: number } = {}
  ): Promise<{ promotions: Promotion[]; total: number }> => {
    const { skip, take } = getPaginationParams({ page: query.page ?? 1, limit: query.limit ?? 50 });
    const where: Prisma.PromotionWhereInput = { storeId };
    const [promotions, total] = await Promise.all([
      prisma.promotion.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      prisma.promotion.count({ where }),
    ]);
    return { promotions, total };
  },

  /** @deprecated No production callers. Do not use for unbounded history reads; use a bounded, scoped query. */
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

  // Legacy, unbounded helpers retained for compatibility/tests only. The
  // active lifecycle worker uses SQL batches with FOR UPDATE SKIP LOCKED.
  // Do not wire these methods into a cron or production bulk-processing path.
  /** @deprecated Use the bounded lifecycle worker. */
  findDueForActivation: (now: Date): Promise<Promotion[]> =>
    prisma.promotion.findMany({ where: { status: 'SCHEDULED', startsAt: { lte: now } } }),

  /** @deprecated Use the bounded lifecycle worker. */
  findDueForExpiry: (now: Date): Promise<Promotion[]> =>
    prisma.promotion.findMany({ where: { status: 'ACTIVE', endsAt: { lte: now } } }),

  /** @deprecated Use the bounded lifecycle worker. */
  // Finds promotions whose window ends within the next
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
