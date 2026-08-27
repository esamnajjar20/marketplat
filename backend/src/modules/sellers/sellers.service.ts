import { prisma } from '../../config/prisma';
import { sellersRepository, SellerProfileWithAds, SellerRatingWithRater } from './sellers.repository';
import { CreateSellerProfileInput, UpdateSellerProfileInput, CreateRatingInput, GetSellerRatingsQuery } from './sellers.validation';
import { ConflictError } from '../../shared/errors/ConflictError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { withSellerProfileCreationLock } from '../../shared/utils/sellerLock';
import { usersRepository } from '../users/users.repository';
import { SellerProfile } from '@prisma/client';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { auditLog, AuditEvent } from '../../shared/utils/auditLog';
import { blockedUsersService } from '../blocked-users';

export const sellersService = {
  createSellerProfile: async (
    userId: string,
    input: CreateSellerProfileInput
  ): Promise<SellerProfile> => {
    // Unlocked pre-check: cheap fast-fail before we even try to take the
    // lock. The authoritative check is the one inside the lock below.
    const existing = await sellersRepository.findByUserId(userId);
    if (existing) {
      throw new ConflictError('You already have a seller profile.', 'SELLER_PROFILE_ALREADY_EXISTS');
    }

    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');

    // Eligibility checks happen before any transaction starts — no need
    // to roll back on a plain business-logic rejection.
    if (!user.email) {
      throw new BadRequestError('You need to verify your email before selling.');
    }
    if (!input.agreedToSellerTerms) {
      throw new BadRequestError('You must agree to the seller terms to continue.');
    }

    return withSellerProfileCreationLock(userId, async () => {
      // Authoritative check, now serialized per-user — closes the TOCTOU
      // race the unlocked pre-check above can't close on its own.
      const stillExisting = await sellersRepository.findByUserId(userId);
      if (stillExisting) {
        throw new ConflictError('You already have a seller profile.', 'SELLER_PROFILE_ALREADY_EXISTS');
      }

      try {
        return await prisma.$transaction(async tx => {
          return sellersRepository.create(tx, userId, {
            displayName: input.displayName ?? user.name,
            bio: input.bio,
            avatarUrl: input.avatarUrl ?? user.avatarUrl ?? undefined,
          });
        });
      } catch (error: any) {
        // Belt-and-suspenders: if a request somehow still raced past both
        // checks above (e.g. a lock TTL edge case), the DB's own @unique
        // constraint on userId is the last line of defense — surfaced as
        // a clean business error, not a raw Prisma P2002 leak.
        if (error?.code === 'P2002') {
          throw new ConflictError('You already have a seller profile.', 'SELLER_PROFILE_ALREADY_EXISTS');
        }
        throw error;
      }
    });
  },

  getMySellerProfile: async (userId: string): Promise<SellerProfile> => {
    const profile = await sellersRepository.findByUserId(userId);
    if (!profile) throw new NotFoundError('Seller profile not found', 'SELLER_NOT_FOUND');
    return profile;
  },

  updateMySellerProfile: async (
    userId: string,
    input: UpdateSellerProfileInput
  ): Promise<SellerProfile> => {
    const profile = await sellersRepository.findByUserId(userId);
    if (!profile) throw new NotFoundError('Seller profile not found', 'SELLER_NOT_FOUND');
    if (profile.suspended) {
      throw new ForbiddenError('Your seller account has been suspended.', 'SELLER_SUSPENDED');
    }
    return sellersRepository.updateMyProfile(profile.id, {
      displayName: input.displayName,
      bio: input.bio,
      avatarUrl: input.avatarUrl,
    });
  },

  getMyAttention: async (userId: string): Promise<{
    adsMissingImages: number;
    productsOutOfStock: number;
    productsMissingImages: number;
    pendingServiceRequests: number;
    hasStore: boolean;
    isProvider: boolean;
  }> => {
    const profile = await sellersRepository.findByUserId(userId);

    const [adsMissingImages, store, provider] = await Promise.all([
      prisma.$queryRaw<[{ c: bigint }]>`
            SELECT COUNT(*)::bigint AS c
            FROM ads
            WHERE "userId" = ${userId}
              AND status = 'ACTIVE'
              AND cardinality(images) = 0
          `.then((rows) => Number(rows[0]?.c ?? 0)),
      profile
        ? prisma.storeDetails.findUnique({ where: { sellerProfileId: profile.id }, select: { id: true } })
        : Promise.resolve(null),
      profile
        ? prisma.serviceProviderDetails.findUnique({
            where: { sellerProfileId: profile.id },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    let productsOutOfStock = 0;
    let productsMissingImages = 0;
    if (store) {
      const [oos, noImg] = await Promise.all([
        prisma.product.count({
          where: { storeId: store.id, status: 'ACTIVE', availability: 'OUT_OF_STOCK' },
        }),
        prisma.$queryRaw<[{ c: bigint }]>`
          SELECT COUNT(*)::bigint AS c
          FROM products
          WHERE "storeId" = ${store.id}
            AND status = 'ACTIVE'
            AND cardinality(images) = 0
        `.then((rows) => Number(rows[0]?.c ?? 0)),
      ]);
      productsOutOfStock = oos;
      productsMissingImages = noImg;
    }

    let pendingServiceRequests = 0;
    if (provider) {
      pendingServiceRequests = await prisma.serviceRequest.count({
        where: { listing: { providerId: provider.id }, status: 'PENDING' },
      });
    }

    return {
      adsMissingImages,
      productsOutOfStock,
      productsMissingImages,
      pendingServiceRequests,
      hasStore: Boolean(store),
      isProvider: Boolean(provider),
    };
  },


  // PLAN-P1-4: verification was previously admin-initiated only —
  // an admin had to already know/decide a seller deserved it, with
  // no signal from the seller side that they wanted it. This is the
  // missing self-service half: moves the seller's own profile to
  // PENDING so it surfaces in the admin queue (AdminSellersTable).
  requestSellerVerification: async (userId: string): Promise<SellerProfile> => {
    const profile = await sellersRepository.findByUserId(userId);
    if (!profile) throw new NotFoundError('Seller profile not found', 'SELLER_NOT_FOUND');
    if (profile.suspended) {
      throw new ForbiddenError('Your seller account has been suspended.', 'SELLER_SUSPENDED');
    }
    if (profile.verified) {
      throw new ConflictError('This seller is already verified.', 'SELLER_ALREADY_VERIFIED');
    }
    if (profile.verificationStatus === 'PENDING') {
      throw new ConflictError('A verification request is already pending review.', 'VERIFICATION_ALREADY_PENDING');
    }
    return sellersRepository.requestVerification(profile.id);
  },

  getPublicSellerProfile: async (sellerProfileId: string): Promise<SellerProfileWithAds> => {
    const profile = await sellersRepository.findPublicProfile(sellerProfileId);
    if (!profile) throw new NotFoundError('Seller not found', 'SELLER_NOT_FOUND');
    return profile;
  },

  // Called from ads.service.ts's createAd, before any Cloudinary upload,
  // so a request that will be rejected anyway doesn't burn upload cost.
  ensureSellerProfileForAdCreation: async (userId: string): Promise<SellerProfile> => {
    const profile = await sellersRepository.findByUserId(userId);
    if (!profile) {
      throw new BadRequestError('You need to create your seller profile first.');
    }
    // AUDIT-FIX: a suspended seller keeps their profile/history visible
    // (see schema.prisma comment) but is blocked from new writes.
    if (profile.suspended) {
      throw new ForbiddenError('Your seller account has been suspended.', 'SELLER_SUSPENDED');
    }
    return profile;
  },

  createRating: async (
    sellerProfileId: string,
    raterId: string,
    input: CreateRatingInput
  ): Promise<void> => {
    const profile = await sellersRepository.findById(sellerProfileId);
    if (!profile) throw new NotFoundError('Seller not found', 'SELLER_NOT_FOUND');

    // Self-rating guard — a seller can never rate their own profile.
    if (profile.userId === raterId) {
      throw new ForbiddenError('You cannot rate your own seller profile.', 'CANNOT_RATE_OWN_PROFILE');
    }

    // SECURITY FIX (blocked-user coverage gap): same gap closed on
    // stores.service.ts's createReview / service-reviews.service.ts's
    // createReview — this is the legacy ad-seller rating path and had
    // the identical hole.
    if (await blockedUsersService.isBlockedEitherDirection(raterId, profile.userId)) {
      throw new ForbiddenError('You cannot rate this seller.', 'USER_BLOCKED');
    }

    try {
      await prisma.$transaction(async tx => {
        await sellersRepository.createRating({
          sellerProfileId,
          raterId,
          adId: input.adId,
          score: input.score,
          comment: input.comment,
        });
        await sellersRepository.recomputeRatingAggregate(tx, sellerProfileId);
      });
    } catch (error: any) {
      // seller_ratings has @@unique([sellerProfileId, raterId, adId]) —
      // this is the DB-level backstop against duplicate ratings for the
      // same seller+deal from the same rater.
      if (error?.code === 'P2002') {
        throw new ConflictError('You have already rated this seller for this transaction.', 'ALREADY_RATED');
      }
      throw error;
    }
  },

  // TRACK-AD-RATINGS-LIST: mirrors service-reviews.service.ts's
  // getReviewsForSeller / stores.service.ts's getStoreReviews exactly
  // — public (no auth check here, same as those two; sellersRouter's
  // GET /:id/ratings route itself is unauthenticated).
  getSellerRatings: async (
    sellerProfileId: string,
    query: GetSellerRatingsQuery
  ): Promise<PaginatedResult<SellerRatingWithRater>> => {
    const profile = await sellersRepository.findById(sellerProfileId);
    if (!profile) throw new NotFoundError('Seller not found', 'SELLER_NOT_FOUND');

    const { ratings, total } = await sellersRepository.findManyRatingsBySellerProfileId(
      sellerProfileId,
      query
    );
    return {
      items: ratings,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  // EPIC 1.1: admin sellers list — the report's finding was that
  // verify/suspend existed with "zero frontend UI" and no way to even
  // discover a seller's id. Mirrors adminService.getAllAds/getAllUsers's
  // shape exactly (skip/take + count in parallel, buildPaginationMeta).
  getAllSellers: async (query: {
    page?: number;
    limit?: number;
    verified?: boolean;
    suspended?: boolean;
    verificationStatus?: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
    q?: string;
  }) => {
    const { page = 1, limit = 20, verified, suspended, verificationStatus, q } = query;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      sellersRepository.findMany({ skip, take: limit, verified, suspended, verificationStatus, q }),
      sellersRepository.count({ verified, suspended, verificationStatus, q }),
    ]);

    return { items, meta: buildPaginationMeta(total, page, limit) };
  },

  setVerification: async (
    sellerProfileId: string,
    verified: boolean,
    adminUserId?: string
  ): Promise<SellerProfile> => {
    const profile = await sellersRepository.findById(sellerProfileId);
    if (!profile) throw new NotFoundError('Seller not found', 'SELLER_NOT_FOUND');
    const updated = await sellersRepository.setVerification(
      sellerProfileId,
      verified,
      profile.verificationStatus
    );

    // EPIC 1.1: this admin action previously left no audit trail at
    // all — every other admin.service.ts mutation (feature/pin/delete
    // ad, activate/deactivate user, change role) calls auditLog, but
    // verifySeller/suspendSeller were added later and missed it.
    auditLog({
      event: AuditEvent.ADMIN_SELLER_VERIFIED,
      userId: adminUserId,
      details: { sellerProfileId, verified },
    }).catch(() => {});

    return updated;
  },

  // AUDIT-FIX: admin-only. Answers "how do we remove seller status?" —
  // suspension rather than deletion, since SellerProfile is the parent
  // of Ad/SellerRating/ServiceProviderDetails (all onDelete: Cascade)
  // and deleting it would destroy real transaction/rating history.
  // Enforced at every write-gating entry point across the seller,
  // service-provider, and service-listing modules (see
  // ensureSellerProfileForAdCreation above and requireOwnProvider in
  // service-listings.service.ts).
  setSuspension: async (
    sellerProfileId: string,
    suspended: boolean,
    adminUserId?: string,
    reason?: string,
  ): Promise<SellerProfile> => {
    const profile = await sellersRepository.findById(sellerProfileId);
    if (!profile) throw new NotFoundError('Seller not found', 'SELLER_NOT_FOUND');
    const updated = await sellersRepository.setSuspension(sellerProfileId, suspended);

    // EPIC 1.1: same missing-audit-trail gap as setVerification above.
    auditLog({
      event: AuditEvent.ADMIN_SELLER_SUSPENDED,
      userId: adminUserId,
      details: { sellerProfileId, suspended, ...(reason ? { reason } : {}) },
    }).catch(() => {});

    return updated;
  },
};
