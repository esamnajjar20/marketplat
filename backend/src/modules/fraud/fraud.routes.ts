import { Router } from 'express';
import { fraudController } from './fraud.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';

export const fraudRouter = Router();

// Admin-only — same guard pattern as adminRouter/auditLogsRouter.
fraudRouter.use(authenticate, requireAdmin);

fraudRouter.get('/ads', fraudController.getFlaggedAds);
fraudRouter.patch('/ads/:adId/clear', fraudController.clearAdFlag);
fraudRouter.post('/ads/:adId/flag', fraudController.manualFlag);

fraudRouter.get('/signals', fraudController.getSignals);
fraudRouter.patch('/signals/:id/review', fraudController.reviewSignal);
