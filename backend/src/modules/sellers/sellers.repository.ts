import { prisma } from '../../config/prisma';
import { Prisma, SellerProfile } from '@prisma/client';

export type SellerProfileWithAds = Prisma.SellerProfileGetPayload<{
  include: {
    ads: true;
  };
}>;

export const sellersRepository = {
  findByUserId: (userId: string): Promise<SellerProfile | null> =>
    prisma.sellerProfile.findUnique({ where: { userId } }),

  findById: (id: string): Promise<SellerProfile | null> =>
    prisma.sellerProfile.findUnique({ where: { id } }),

  create: (
    tx: Prisma.TransactionClient,
    userId: string,
    data: { displayName: string; bio?: string; avatarUrl?: string }
  ): Promise<SellerProfile> =>
    tx.sellerProfile.create({
      data: {
        userId,
        displayName: data.displayName,
        bio: data.bio,
        avatarUrl: data.avatarUrl,
      },
    }),

  // Called inside the same transaction as ad creation (see ads.service.ts)
  // so totalAds/activeAds never drift from the actual number of ads
  // referencing this sellerProfileId.
  incrementStatsOnAdCreated: (
    tx: Prisma.TransactionClient,
    sellerProfileId: string
  ): Promise<SellerProfile> =>
    tx.sellerProfile.update({
      where: { id: sellerProfileId },
      data: { totalAds: { increment: 1 }, activeAds: { increment: 1 } },
    }),

  decrementActiveAdsOnSold: (
    tx: Prisma.TransactionClient,
    sellerProfileId: string
  ): Promise<SellerProfile> =>
    tx.sellerProfile.update({
      where: { id: sellerProfileId },
      data: { activeAds: { decrement: 1 }, totalSales: { increment: 1 } },
    }),

  findPublicProfile: (id: string): Promise<SellerProfileWithAds | null> =>
    prisma.sellerProfile.findUnique({
      where: { id },
      include: {
        ads: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } },
      },
    }),

  setVerification: (id: string, verified: boolean): Promise<SellerProfile> =>
    prisma.sellerProfile.update({
      where: { id },
      data: {
        verified,
        verificationStatus: verified ? 'VERIFIED' : 'UNVERIFIED',
        verifiedAt: verified ? new Date() : null,
      },
    }),

  // AUDIT-FIX: admin-only suspend/unsuspend, mirroring setVerification's
  // shape exactly. Does not touch verified/verificationStatus (those
  // are orthogonal — a verified seller can still be suspended, and
  // suspension doesn't retroactively un-verify them).
  setSuspension: (id: string, suspended: boolean): Promise<SellerProfile> =>
    prisma.sellerProfile.update({
      where: { id },
      data: {
        suspended,
        suspendedAt: suspended ? new Date() : null,
      },
    }),

  createRating: (data: {
    sellerProfileId: string;
    raterId: string;
    adId?: string;
    score: number;
    comment?: string;
  }) => prisma.sellerRating.create({ data }),

  // Recomputed from the actual rows rather than incremented, so a
  // deleted/edited rating can never leave averageRating/totalRatings
  // silently out of sync with seller_ratings.
  //
  // services-design.md §10: service reviews feed the same trust signal
  // as ad-side seller_ratings — a provider's average/total blends both
  // sources rather than keeping two separate scores, so buyers see one
  // number regardless of whether their history with a seller is
  // product-ad or service-request based. Recomputed the same
  // read-both-then-merge way on every write to either table (this
  // method is also called from service-reviews.service.ts).
  recomputeRatingAggregate: async (
    tx: Prisma.TransactionClient,
    sellerProfileId: string
  ): Promise<SellerProfile> => {
    const [adAgg, serviceAgg] = await Promise.all([
      tx.sellerRating.aggregate({
        where: { sellerProfileId },
        _sum: { score: true },
        _count: { score: true },
      }),
      tx.serviceReview.aggregate({
        where: { sellerProfileId },
        _sum: { score: true },
        _count: { score: true },
      }),
    ]);
    const totalCount = adAgg._count.score + serviceAgg._count.score;
    const totalSum = (adAgg._sum.score ?? 0) + (serviceAgg._sum.score ?? 0);
    return tx.sellerProfile.update({
      where: { id: sellerProfileId },
      data: {
        averageRating: totalCount > 0 ? totalSum / totalCount : 0,
        totalRatings: totalCount,
      },
    });
  },
};
