import { Router } from 'express';
import { activityController } from './activity.controller';
import { authenticate } from '../../../middlewares/auth.middleware';
import { CACHE } from '../../../middlewares/cacheControl.middleware';

export const activityRouter = Router();

// Every route here is the caller's own activity only — no admin or
// public read path exists (a user's activity timeline is private),
// same "authenticate on every route" shape as notificationsRouter.
// Static dashboard route must be registered before '/' to keep its intent explicit.
activityRouter.get('/dashboard', authenticate, CACHE.NONE, activityController.getDashboardOverview);
activityRouter.get('/', authenticate, CACHE.NONE, activityController.getMyActivity);
