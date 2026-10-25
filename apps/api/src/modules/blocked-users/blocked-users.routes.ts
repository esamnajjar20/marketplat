import { Router } from 'express';
import { blockedUsersController } from './blocked-users.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { userBlockRateLimit } from '../../middlewares/rateLimit.middleware';

export const blockedUsersRouter = Router();

// All routes require auth — blocking is always caller-scoped, never
// publicly listable (same posture as favorites/conversations).
blockedUsersRouter.get('/', authenticate, CACHE.NONE, blockedUsersController.getMyBlockedUsers);
blockedUsersRouter.post(
  '/:userId',
  authenticate,
  userBlockRateLimit,
  blockedUsersController.toggleBlock
);
