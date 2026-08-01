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
};
