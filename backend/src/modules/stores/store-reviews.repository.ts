import { prisma } from '../../config/prisma';
import { Prisma, StoreReview } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

export type StoreReviewWithRater = Prisma.StoreReviewGetPayload<{
  include: { rater: { select: { id: true; name: true; avatarUrl: true } } };
}>;

export const storeReviewsRepository = {
  findBySellerAndRater: (sellerProfileId: string, raterId: string): Promise<StoreReview | null> =>
    prisma.storeReview.findUnique({
      where: { sellerProfileId_raterId: { sellerProfileId, raterId } },
    }),

  create: (
    tx: Prisma.TransactionClient,
    data: { sellerProfileId: string; raterId: string; score: number; comment?: string }
  ): Promise<StoreReview> => tx.storeReview.create({ data }),

  findManyBySellerProfileId: async (
    sellerProfileId: string,
    query: { page?: number; limit?: number }
  ): Promise<{ reviews: StoreReviewWithRater[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.StoreReviewWhereInput = { sellerProfileId };

    const [reviews, total] = await Promise.all([
      prisma.storeReview.findMany({
        where,
        include: { rater: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.storeReview.count({ where }),
    ]);

    return { reviews, total };
  },

  // BADGES: single-store average score + count, used by
  // badges.service.ts's HIGHLY_RATED criterion. avg is null (not 0)
  // when there are zero reviews — the caller must treat null as "not
  // enough data" rather than "rated zero".
  getRatingSummary: async (
    sellerProfileId: string
  ): Promise<{ avg: number | null; count: number }> => {
    const result = await prisma.storeReview.aggregate({
      where: { sellerProfileId },
      _avg: { score: true },
      _count: true,
    });
    return { avg: result._avg.score, count: result._count };
  },

  // BADGES: batch variant for store-list/search cards — one grouped
  // query instead of N single-store aggregates, same N+1-avoidance
  // reasoning as promotionsRepository.findLiveByProductIds.
  getRatingSummaries: async (
    sellerProfileIds: string[]
  ): Promise<Map<string, { avg: number | null; count: number }>> => {
    if (sellerProfileIds.length === 0) return new Map();
    const rows = await prisma.storeReview.groupBy({
      by: ['sellerProfileId'],
      where: { sellerProfileId: { in: sellerProfileIds } },
      _avg: { score: true },
      _count: true,
    });
    return new Map(rows.map(row => [row.sellerProfileId, { avg: row._avg.score, count: row._count }]));
  },
};
