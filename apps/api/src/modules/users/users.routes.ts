import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireVerifiedEmail } from '../../middlewares/requireVerifiedEmail.middleware';
import { usersRateLimit, changePasswordRateLimit } from '../../middlewares/rateLimit.middleware';
import { uploadMiddleware } from '../../middlewares/upload.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const usersRouter = Router();

usersRouter.use(usersRateLimit);

// Protected — /me MUST be registered before /:id
// Express matches routes in order; if /:id comes first, GET /me matches it with id="me"
usersRouter.get('/me/bootstrap', authenticate, usersController.getBootstrap);
usersRouter.get('/me', authenticate, CACHE.PRIVATE_REVALIDATE, usersController.getMe);
usersRouter.patch('/me', authenticate, usersController.updateMe);
// Both the legacy DELETE and the explicit confirmation endpoint require
// password re-authentication. Never expose usersService.deleteMe directly.
usersRouter.delete(
  '/me',
  authenticate,
  changePasswordRateLimit,
  usersController.deleteMeWithReauth
);
usersRouter.post(
  '/me/delete-confirmed',
  authenticate,
  changePasswordRateLimit,
  usersController.deleteMeWithReauth
);
// stricter, fail-closed rate limit on top of the general
// usersRateLimit — see changePasswordRateLimit's definition for why.
usersRouter.post(
  '/me/password',
  authenticate,
  changePasswordRateLimit,
  usersController.changePassword
);
usersRouter.post(
  '/me/avatar',
  authenticate,
  requireVerifiedEmail,
  uploadMiddleware,
  usersController.uploadAvatar
);
usersRouter.patch('/me/notifications', authenticate, usersController.updateNotificationPreferences);
usersRouter.patch('/me/presence', authenticate, usersController.touchPresence);

// Protected, but registered before the public /:id below for the same
// reason /me is: "presence" would otherwise match /:id with id="presence".
usersRouter.get('/presence', authenticate, usersController.getPresence);

// Public — after /me and /presence so those literal strings are not intercepted
usersRouter.get('/:id', CACHE.MEDIUM, usersController.getUserById);
usersRouter.get('/:id/ads', CACHE.SHORT, usersController.getUserAds);
