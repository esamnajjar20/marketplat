import { Router } from 'express';
import { storesController } from './stores.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import {
  createStoreRateLimit,
  storeFollowRateLimit,
  storeReviewRateLimit,
} from '../../middlewares/rateLimit.middleware';

export const storesRouter = Router();

// Public directory
storesRouter.get('/', CACHE.SHORT, storesController.getStores);

// Registered before /:id so "me"/"followed" are never swallowed as an
// :id param — same convention as service-listings.routes.ts's /me.
storesRouter.get('/me', authenticate, CACHE.NONE, storesController.getMyStore);
storesRouter.patch('/me', authenticate, storesController.updateMyStore);
storesRouter.get('/me/followed', authenticate, CACHE.NONE, storesController.getMyFollowedStores);

storesRouter.post('/', authenticate, createStoreRateLimit, storesController.createStore);

// Public store page
storesRouter.get('/:id', CACHE.MEDIUM, storesController.getPublicStore);

// Admin-only approval/blocking
storesRouter.patch(
  '/:id/status',
  authenticate,
  requireAdmin,
  storesController.updateStoreStatus
);

// Follow / unfollow
storesRouter.post(
  '/:id/follow',
  authenticate,
  storeFollowRateLimit,
  storesController.toggleFollow
);

// Reviews
storesRouter.get('/:id/reviews', CACHE.SHORT, storesController.getStoreReviews);
storesRouter.post(
  '/:id/reviews',
  authenticate,
  storeReviewRateLimit,
  storesController.createReview
);
