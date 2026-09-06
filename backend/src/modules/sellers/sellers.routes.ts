import { Router } from 'express';
import { sellersController } from './sellers.controller';
import { sellersRankingController } from './sellers-ranking.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import {
  createSellerProfileRateLimit,
  sellerRatingRateLimit,
  requestVerificationRateLimit,
} from '../../middlewares/rateLimit.middleware';

export const sellersRouter = Router();

// Authenticated only — no role check. Any signed-in USER is eligible
// once they meet the eligibility checks in sellersService.
sellersRouter.get('/me/profile', authenticate, CACHE.NONE, sellersController.getMySellerProfile);
sellersRouter.patch('/me/profile', authenticate, CACHE.NONE, sellersController.updateMySellerProfile);
sellersRouter.get('/me/attention', authenticate, CACHE.NONE, sellersController.getMyAttention);
sellersRouter.post(
  '/me/profile',
  authenticate,
  createSellerProfileRateLimit,
  sellersController.createSellerProfile
);

// PLAN-P1-4: seller-facing verification request — sets
// verificationStatus to PENDING for an admin to review via
// PATCH /admin/sellers/:id/verify. Distinct from that admin route:
// this one can never set `verified` itself.
sellersRouter.post(
  '/me/profile/verification-request',
  authenticate,
  requestVerificationRateLimit,
  sellersController.requestVerification
);

// TRACK-SELLER-RANKING — before /:id so "ranking" is never an :id
sellersRouter.get('/ranking', CACHE.SHORT, sellersRankingController.getTop);

// Public — anyone can view a seller's page, no authentication required.
sellersRouter.get('/:id', CACHE.MEDIUM, sellersController.getPublicSellerProfile);

sellersRouter.post(
  '/:id/ratings',
  authenticate,
  sellerRatingRateLimit,
  sellersController.createRating
);

// TRACK-AD-RATINGS-LIST: public — mirrors
// service-reviews.routes.ts's GET /seller/:sellerProfileId /
// stores.routes.ts's GET /:id/reviews (same CACHE.SHORT). Was entirely
// missing — POST existed with no way to read the individual ratings
// back, only the aggregate averageRating/totalRatings on the profile.
sellersRouter.get('/:id/ratings', CACHE.SHORT, sellersController.getSellerRatings);
