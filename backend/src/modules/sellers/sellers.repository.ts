import { prisma } from '../../config/prisma';
import { Prisma, SellerProfile, SellerVerificationStatus } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

export type SellerProfileWithAds = Prisma.SellerProfileGetPayload<{
  include: {
    ads: true;
    user: { select: { city: true } };
  };
}>;

// TRACK-AD-RATINGS-LIST: same include shape as
// service-reviews.repository.ts's ServiceReviewWithRater / stores'
// StoreReviewWithRater — only id/name/avatarUrl, never email/phone, so
// this public list can't leak contact info about whoever rated a seller.
export type SellerRatingWithRater = Prisma.SellerRatingGetPayload<{
  include: {
    rater: { select: { id: true; name: true; avatarUrl: true } };
    ad: { select: { id: true; title: true } };
  };
}>;

export const sellersRepository = {
  findByUserId: (userId: string): Promise<SellerProfile | null> =>
    prisma.sellerProfile.findUnique({ where: { userId } }),

  findById: (id: string): Promise<SellerProfile | null> =>
    prisma.sellerProfile.findUnique({ where: { id } }),

  // EPIC 1.1: admin sellers list — mirrors adminService.getAllAds/
  // getAllUsers's where/skip/take + count-in-parallel shape exactly
  // (see admin.service.ts). Needed so an admin can find a seller to
  // verify/suspend at all; PATCH /admin/sellers/:id/verify and
  // /suspend already existed with no way to discover a seller's id
  // from the UI.
  findMany: (params: {
    skip: number;
    take: number;
    verified?: boolean;
    suspended?: boolean;
    verificationStatus?: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
    q?: string;
  }): Promise<
    Array<SellerProfile & { user: { id: string; name: string; email: string } }>
  > =>
    prisma.sellerProfile.findMany({
      where: {
        ...(params.verified !== undefined && { verified: params.verified }),
        ...(params.suspended !== undefined && { suspended: params.suspended }),
        ...(params.verificationStatus !== undefined && { verificationStatus: params.verificationStatus }),
        // Same tradeoff noted in admin.service.ts's getAllAds/getAllUsers:
        // no index covers this pattern-match, acceptable for a
        // low-QPS admin-only endpoint.
        ...(params.q && {
          OR: [
            { displayName: { contains: params.q, mode: 'insensitive' as const } },
            { user: { name: { contains: params.q, mode: 'insensitive' as const } } },
            { user: { email: { contains: params.q, mode: 'insensitive' as const } } },
          ],
        }),
      },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
    }),

  count: (params: {
    verified?: boolean;
    suspended?: boolean;
    verificationStatus?: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
    q?: string;
  }): Promise<number> =>
    prisma.sellerProfile.count({
      where: {
        ...(params.verified !== undefined && { verified: params.verified }),
        ...(params.suspended !== undefined && { suspended: params.suspended }),
        ...(params.verificationStatus !== undefined && { verificationStatus: params.verificationStatus }),
        ...(params.q && {
          OR: [
            { displayName: { contains: params.q, mode: 'insensitive' as const } },
            { user: { name: { contains: params.q, mode: 'insensitive' as const } } },
            { user: { email: { contains: params.q, mode: 'insensitive' as const } } },
          ],
        }),
      },
    }),

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

  updateMyProfile: (
    id: string,
    data: { displayName?: string; bio?: string | null; avatarUrl?: string | null }
  ): Promise<SellerProfile> =>
    prisma.sellerProfile.update({
      where: { id },
      data: {
        ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
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

  // PLAN-P1-3: `city` isn't a SellerProfile column (unlike
  // StoreDetails/ServiceProviderDetails, which each store their own —
  // a seller has exactly one, so there's no reason to duplicate it).
  // It lives on User and was never joined in here, so the public
  // profile always showed None. Select-only (not full user include)
  // to avoid leaking anything else about the account.
  findPublicProfile: (id: string): Promise<SellerProfileWithAds | null> =>
    prisma.sellerProfile.findUnique({
      where: { id },
      include: {
        ads: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } },
        user: { select: { city: true } },
      },
    }),

  // PLAN-P1-4: SellerVerificationStatus had PENDING/REJECTED sitting
  // unused in the enum — every write went straight verified boolean
  // true→VERIFIED / false→UNVERIFIED, so a seller who asked to be
  // verified and a seller who never asked looked identical (both
  // UNVERIFIED) and admin had no queue to work from. Rejecting a
  // PENDING request now lands on REJECTED instead of UNVERIFIED, so
  // that distinction survives; un-verifying an already-VERIFIED
  // seller still resets to UNVERIFIED (that's a status revocation,
  // not a rejection of a request).
  setVerification: (id: string, verified: boolean, currentStatus: SellerVerificationStatus): Promise<SellerProfile> =>
    prisma.sellerProfile.update({
      where: { id },
      data: {
        verified,
        verificationStatus: verified
          ? 'VERIFIED'
          : currentStatus === 'PENDING'
            ? 'REJECTED'
            : 'UNVERIFIED',
        verifiedAt: verified ? new Date() : null,
      },
    }),

  // PLAN-P1-4: the seller-facing counterpart — moves UNVERIFIED/REJECTED
  // to PENDING so it shows up for admin review. Never touches `verified`
  // itself (only an admin action does that, via setVerification above).
  requestVerification: (id: string): Promise<SellerProfile> =>
    prisma.sellerProfile.update({
      where: { id },
      data: { verificationStatus: 'PENDING' },
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

  // TRACK-AD-RATINGS-LIST: mirrors
  // service-reviews.repository.ts's findManyBySellerProfileId /
  // store-reviews.repository.ts's own version exactly (same
  // page/limit → skip/take via getPaginationParams, same
  // orderBy createdAt desc, same Promise.all findMany+count) — the
  // three review/rating surfaces (ad, service, store) already share
  // one aggregate via recomputeRatingAggregate below; this keeps their
  // list-reading shape identical too; ad's own `ad` include (title) is
  // the one difference, since a SellerRating can be scoped to one
  // specific ad transaction while ServiceReview/StoreReview cannot.
  findManyRatingsBySellerProfileId: async (
    sellerProfileId: string,
    query: { page?: number; limit?: number }
  ): Promise<{ ratings: SellerRatingWithRater[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.SellerRatingWhereInput = { sellerProfileId };

    const [ratings, total] = await Promise.all([
      prisma.sellerRating.findMany({
        where,
        include: {
          rater: { select: { id: true, name: true, avatarUrl: true } },
          ad: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.sellerRating.count({ where }),
    ]);
    return { ratings, total };
  },

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
    const [adAgg, serviceAgg, storeAgg] = await Promise.all([
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
      // Stores module: a store's reviews feed into the same unified
      // trust score as ad ratings and service reviews — one
      // averageRating/totalRatings per SellerProfile, regardless of
      // which of the three product surfaces (ad, service, store) the
      // rating came from.
      tx.storeReview.aggregate({
        where: { sellerProfileId },
        _sum: { score: true },
        _count: { score: true },
      }),
    ]);
    const totalCount = adAgg._count.score + serviceAgg._count.score + storeAgg._count.score;
    const totalSum =
      (adAgg._sum.score ?? 0) + (serviceAgg._sum.score ?? 0) + (storeAgg._sum.score ?? 0);
    return tx.sellerProfile.update({
      where: { id: sellerProfileId },
      data: {
        averageRating: totalCount > 0 ? totalSum / totalCount : 0,
        totalRatings: totalCount,
      },
    });
  },
};
