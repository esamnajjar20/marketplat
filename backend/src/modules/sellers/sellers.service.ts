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

export const sellersService = {
  createSellerProfile: async (
    userId: string,
    input: CreateSellerProfileInput
  ): Promise<SellerProfile> => {
    // Unlocked pre-check: cheap fast-fail before we even try to take the
    // lock. The authoritative check is the one inside the lock below.
    const existing = await sellersRepository.findByUserId(userId);
    if (existing) {
      throw new ConflictError('You already have a seller profile.');
    }

    const user = await usersRepository.findById(userId);
    if (!user) throw new NotFoundError('User not found');

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
        throw new ConflictError('You already have a seller profile.');
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
          throw new ConflictError('You already have a seller profile.');
        }
        throw error;
      }
    });
  },

  getMySellerProfile: async (userId: string): Promise<SellerProfile> => {
    const profile = await sellersRepository.findByUserId(userId);
    if (!profile) throw new NotFoundError('Seller profile not found');
    return profile;
  },

  getPublicSellerProfile: async (sellerProfileId: string): Promise<SellerProfileWithAds> => {
    const profile = await sellersRepository.findPublicProfile(sellerProfileId);
    if (!profile) throw new NotFoundError('Seller not found');
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
      throw new ForbiddenError('Your seller account has been suspended.');
    }
    return profile;
  },

  createRating: async (
    sellerProfileId: string,
    raterId: string,
    input: CreateRatingInput
  ): Promise<void> => {
    const profile = await sellersRepository.findById(sellerProfileId);
    if (!profile) throw new NotFoundError('Seller not found');

    // Self-rating guard — a seller can never rate their own profile.
    if (profile.userId === raterId) {
      throw new ForbiddenError('You cannot rate your own seller profile.');
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
        throw new ConflictError('You have already rated this seller for this transaction.');
      }
      throw error;
    }
  },

  setVerification: async (sellerProfileId: string, verified: boolean): Promise<SellerProfile> => {
    const profile = await sellersRepository.findById(sellerProfileId);
    if (!profile) throw new NotFoundError('Seller not found');
    return sellersRepository.setVerification(sellerProfileId, verified);
  },

  // AUDIT-FIX: admin-only. Answers "how do we remove seller status?" —
  // suspension rather than deletion, since SellerProfile is the parent
  // of Ad/SellerRating/ServiceProviderDetails (all onDelete: Cascade)
  // and deleting it would destroy real transaction/rating history.
  // Enforced at every write-gating entry point across the seller,
  // service-provider, and service-listing modules (see
  // ensureSellerProfileForAdCreation above and requireOwnProvider in
  // service-listings.service.ts).
  setSuspension: async (sellerProfileId: string, suspended: boolean): Promise<SellerProfile> => {
    const profile = await sellersRepository.findById(sellerProfileId);
    if (!profile) throw new NotFoundError('Seller not found');
    return sellersRepository.setSuspension(sellerProfileId, suspended);
  },
};
