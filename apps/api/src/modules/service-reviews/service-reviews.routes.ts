import { Router } from 'express';
import { serviceReviewsController } from './service-reviews.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireVerifiedEmail } from '../../middlewares/requireVerifiedEmail.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { serviceReviewRateLimit } from '../../middlewares/rateLimit.middleware';

export const serviceReviewsRouter = Router();

// Public — anyone browsing a provider's page can read their reviews.
serviceReviewsRouter.get(
  '/seller/:sellerProfileId',
  CACHE.SHORT,
  serviceReviewsController.getReviewsForSeller
);

// T351 — reviews are public-facing content; require verified email like
// every other user-generated public artifact (ads, products, requests).
serviceReviewsRouter.post(
  '/',
  authenticate,
  requireVerifiedEmail,
  serviceReviewRateLimit,
  serviceReviewsController.createReview
);
