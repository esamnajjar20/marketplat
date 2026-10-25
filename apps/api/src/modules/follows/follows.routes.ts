import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { followRateLimit } from '../../middlewares/rateLimit.middleware';
import { followsController } from './follows.controller';

export const followsRouter = Router();

followsRouter.get('/feed', authenticate, followsController.feed);
followsRouter.post('/', authenticate, followRateLimit, followsController.toggle);
followsRouter.get('/me', authenticate, followsController.myFollowing);
followsRouter.get('/status/:targetType/:targetId', authenticate, followsController.status);
followsRouter.get('/target/:targetType/:targetId/followers', followsController.targetFollowers);
followsRouter.get('/users/:id/followers', followsController.userFollowers);
followsRouter.get('/users/:id/following', followsController.userFollowing);
