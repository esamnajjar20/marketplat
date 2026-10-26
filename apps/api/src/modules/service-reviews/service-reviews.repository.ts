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

  // ANALYTICS/BADGES: mirrors storeReviewsRepository.getRatingSummary
  // exactly (same aggregate shape) — used by both
  // service-providers.service.ts's getMyServiceProviderAnalytics and
  // badges.service.ts's getProviderBadges, so a provider's rating is
  // computed the same one way in both places rather than each rolling
  // its own aggregate query.
  getRatingSummary: async (
    sellerProfileId: string
  ): Promise<{ avg: number | null; count: number }> => {
    const result = await prisma.serviceReview.aggregate({
      where: { sellerProfileId },
      _avg: { score: true },
      _count: true,
    });
    return { avg: result._avg.score, count: result._count };
  },

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
