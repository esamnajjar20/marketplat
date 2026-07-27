import { Router } from 'express';
import { sellersController } from './sellers.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import {
  createSellerProfileRateLimit,
  sellerRatingRateLimit,
} from '../../middlewares/rateLimit.middleware';

export const sellersRouter = Router();

// Authenticated only — no role check. Any signed-in USER is eligible
// once they meet the eligibility checks in sellersService.
sellersRouter.get('/me/profile', authenticate, CACHE.NONE, sellersController.getMySellerProfile);
sellersRouter.post(
  '/me/profile',
  authenticate,
  createSellerProfileRateLimit,
  sellersController.createSellerProfile
);

// Public — anyone can view a seller's page, no authentication required.
sellersRouter.get('/:id', CACHE.MEDIUM, sellersController.getPublicSellerProfile);

sellersRouter.post(
  '/:id/ratings',
  authenticate,
  sellerRatingRateLimit,
  sellersController.createRating
);
