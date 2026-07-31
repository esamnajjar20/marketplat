import { prisma } from '../../config/prisma';
import { sellersRepository, SellerProfileWithAds } from './sellers.repository';
import { CreateSellerProfileInput, CreateRatingInput } from './sellers.validation';
import { ConflictError } from '../../shared/errors/ConflictError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { withSellerProfileCreationLock } from '../../shared/utils/sellerLock';
import { usersRepository } from '../users/users.repository';
import { SellerProfile } from '@prisma/client';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { auditLog, AuditEvent } from '../../shared/utils/auditLog';

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

  // EPIC 1.1: admin sellers list — the report's finding was that
  // verify/suspend existed with "zero frontend UI" and no way to even
  // discover a seller's id. Mirrors adminService.getAllAds/getAllUsers's
  // shape exactly (skip/take + count in parallel, buildPaginationMeta).
  getAllSellers: async (query: {
    page?: number;
    limit?: number;
    verified?: boolean;
    suspended?: boolean;
    q?: string;
  }) => {
    const { page = 1, limit = 20, verified, suspended, q } = query;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      sellersRepository.findMany({ skip, take: limit, verified, suspended, q }),
      sellersRepository.count({ verified, suspended, q }),
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
    const updated = await sellersRepository.setVerification(sellerProfileId, verified);

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
    adminUserId?: string
  ): Promise<SellerProfile> => {
    const profile = await sellersRepository.findById(sellerProfileId);
    if (!profile) throw new NotFoundError('Seller not found', 'SELLER_NOT_FOUND');
    const updated = await sellersRepository.setSuspension(sellerProfileId, suspended);

    // EPIC 1.1: same missing-audit-trail gap as setVerification above.
    auditLog({
      event: AuditEvent.ADMIN_SELLER_SUSPENDED,
      userId: adminUserId,
      details: { sellerProfileId, suspended },
    }).catch(() => {});

    return updated;
  },
};
