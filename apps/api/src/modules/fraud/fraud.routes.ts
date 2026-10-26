import { Router } from 'express';
import { fraudController } from './fraud.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireMinRole } from '../../middlewares/admin.middleware';
import { ROLES } from '../../shared/constants/roles';

export const fraudRouter = Router();

// Admin-tier — MODERATOR and above (Gap #20: fraud queue is explicitly
// in the MODERATOR tier, same as reports/ads moderation).
fraudRouter.use(authenticate, requireMinRole(ROLES.MODERATOR));

fraudRouter.get('/ads', fraudController.getFlaggedAds);
fraudRouter.patch('/ads/:adId/clear', fraudController.clearAdFlag);
fraudRouter.post('/ads/:adId/flag', fraudController.manualFlag);

fraudRouter.get('/signals', fraudController.getSignals);
fraudRouter.patch('/signals/:id/review', fraudController.reviewSignal);
