import { Router } from 'express';
import { storesController } from './stores.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { uploadMiddleware } from '../../middlewares/upload.middleware';
import { storeMembersController } from './store-members.controller';
import {
  createStoreRateLimit,
  storeFollowRateLimit,
  storeReviewRateLimit,
  storeImagesRateLimit,
} from '../../middlewares/rateLimit.middleware';

export const storesRouter = Router();

// Public directory
storesRouter.get('/', CACHE.SHORT, storesController.getStores);

// Registered before /:id so "me"/"followed" are never swallowed as an
// :id param — same convention as service-listings.routes.ts's /me.
storesRouter.get('/me', authenticate, CACHE.NONE, storesController.getMyStore);
storesRouter.patch('/me', authenticate, storesController.updateMyStore);
storesRouter.get('/me/followed', authenticate, CACHE.NONE, storesController.getMyFollowedStores);

// STORE-ANALYTICS (Foundation v1): owner-only, same registration-order
// reasoning as /me/followed above.
storesRouter.get('/me/analytics', authenticate, CACHE.NONE, storesController.getMyStoreAnalytics);
storesRouter.post('/me/feature-request', authenticate, CACHE.NONE, storesController.requestFeature);

// Logo/cover upload — same single-image pattern as POST /users/me/avatar.
// Registered alongside the other /me routes for the same "never
// swallowed as :id" reason.
storesRouter.post(
  '/me/logo',
  authenticate,
  storeImagesRateLimit,
  uploadMiddleware,
  storesController.uploadLogo
);
storesRouter.post(
  '/me/cover',
  authenticate,
  storeImagesRateLimit,
  uploadMiddleware,
  storesController.uploadCover
);


// ─── Store members (staff permissions) ───────────────────────────────────────
// Before /:id so "me/member-invites" is never swallowed as an :id.
storesRouter.get(
  '/me/member-invites',
  authenticate,
  CACHE.NONE,
  storeMembersController.listMyPendingInvites
);
storesRouter.post(
  '/me/member-invites/:memberId/accept',
  authenticate,
  storeMembersController.acceptInvite
);

storesRouter.post('/', authenticate, createStoreRateLimit, storesController.createStore);

// Members of a store — before generic /:id sub-routes that might conflict is fine;
// path is /:id/members so must stay after /me/* only.
storesRouter.get(
  '/:id/members',
  authenticate,
  CACHE.NONE,
  storeMembersController.listMembers
);
storesRouter.post(
  '/:id/members',
  authenticate,
  storeMembersController.inviteMember
);
storesRouter.patch(
  '/:id/members/:memberId',
  authenticate,
  storeMembersController.updateMemberRole
);
storesRouter.delete(
  '/:id/members/:memberId',
  authenticate,
  storeMembersController.removeMember
);


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
