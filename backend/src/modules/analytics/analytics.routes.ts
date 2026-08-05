import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';
import { analyticsEventsRateLimit } from '../../middlewares/rateLimit.middleware';

export const analyticsRouter = Router();

// Deliberately NOT behind `authenticate` — most marketplace traffic is
// anonymous (browsing/searching before ever logging in), and a
// product-analytics endpoint that required a session would miss most
// of what it exists to measure. analyticsService.trackEvents still
// attributes the event to a userId when a valid Bearer token happens
// to be present (see analytics.service.ts's resolveOptionalUserId).
analyticsRouter.post('/events', analyticsEventsRateLimit, analyticsController.trackEvents);

export const analyticsAdminRouter = Router();

// Admin-only — same guard pattern as auditLogsRouter.
analyticsAdminRouter.get(
  '/summary',
  authenticate,
  requireAdmin,
  analyticsController.getSummary
);
