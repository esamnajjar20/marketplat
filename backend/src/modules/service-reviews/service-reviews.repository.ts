import { prisma } from '../../config/prisma';
import { Prisma, ServiceReview } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

export type ServiceReviewWithRater = Prisma.ServiceReviewGetPayload<{
  include: { rater: { select: { id: true; name: true; avatarUrl: true } } };
}>;

export const serviceReviewsRepository = {
  create: (
    tx: Prisma.TransactionClient,
    data: {
      requestId: string;
      raterId: string;
      sellerProfileId: string;
      score: number;
      comment?: string;
    }
  ): Promise<ServiceReview> => tx.serviceReview.create({ data }),

  findByRequestId: (requestId: string): Promise<ServiceReview | null> =>
    prisma.serviceReview.findUnique({ where: { requestId } }),

  findManyBySellerProfileId: async (
    sellerProfileId: string,
    query: { page?: number; limit?: number }
  ): Promise<{ reviews: ServiceReviewWithRater[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.ServiceReviewWhereInput = { sellerProfileId };

    const [reviews, total] = await Promise.all([
      prisma.serviceReview.findMany({
        where,
        include: { rater: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.serviceReview.count({ where }),
    ]);
    return { reviews, total };
  },
};
