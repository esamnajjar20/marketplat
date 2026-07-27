import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { usersRateLimit, changePasswordRateLimit } from '../../middlewares/rateLimit.middleware';
import { uploadMiddleware } from '../../middlewares/upload.middleware';

export const usersRouter = Router();

usersRouter.use(usersRateLimit);

// Protected — /me MUST be registered before /:id
// Express matches routes in order; if /:id comes first, GET /me matches it with id="me"
usersRouter.get('/me', authenticate, usersController.getMe);
usersRouter.patch('/me', authenticate, usersController.updateMe);
usersRouter.delete('/me', authenticate, usersController.deleteMe);
// FIX SEC-09: stricter, fail-closed rate limit on top of the general
// usersRateLimit — see changePasswordRateLimit's definition for why.
usersRouter.post('/me/password', authenticate, changePasswordRateLimit, usersController.changePassword);
usersRouter.post('/me/avatar', authenticate, uploadMiddleware, usersController.uploadAvatar);
usersRouter.patch('/me/notifications', authenticate, usersController.updateNotificationPreferences);

// Public — after /me so the literal string "me" is not intercepted
usersRouter.get('/:id', usersController.getUserById);
usersRouter.get('/:id/ads', usersController.getUserAds);
