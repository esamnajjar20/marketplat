import { Router } from 'express';
import { reportsController } from './reports.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';
import { reportRateLimit } from '../../middlewares/rateLimit.middleware';

export const reportsRouter = Router();

reportsRouter.post('/ads/:adId', authenticate, reportRateLimit, reportsController.createReport);

// FEAT-REPORT-USER-STORE: reports a user profile or a store — e.g.
// POST /reports/users/:targetId or POST /reports/stores/:targetId.
// targetType is constrained to users|stores by createTargetReportSchema
// (400 for anything else, including "ads"), and /ads/:adId above already
// wins for that path since it's registered first — AD keeps using its
// own dedicated route, unchanged, so existing callers and tests aren't
// touched.
reportsRouter.post(
  '/:targetType/:targetId',
  authenticate,
  reportRateLimit,
  reportsController.createTargetReport
);

// FEAT-REPORT-USER-STORE: "بلاغاتي" — must be registered before the
// admin-only GET /:id below, or Express would match the literal path
// segment "me" against the :id param first and route it into
// getReportById (admin-gated) instead of here.
reportsRouter.get('/me', authenticate, reportsController.getMyReports);

reportsRouter.get('/', authenticate, requireAdmin, reportsController.getReports);
reportsRouter.get('/:id', authenticate, requireAdmin, reportsController.getReportById);
reportsRouter.patch(
  '/:id/status',
  authenticate,
  requireAdmin,
  reportsController.updateReportStatus
);
