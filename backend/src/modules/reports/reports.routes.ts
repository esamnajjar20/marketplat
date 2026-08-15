import { Router } from 'express';
import { reportsController } from './reports.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireMinRole } from '../../middlewares/admin.middleware';
import { ROLES } from '../../shared/constants/roles';
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

reportsRouter.get('/', authenticate, requireMinRole(ROLES.MODERATOR), reportsController.getReports);

// BULK-ADMIN (item 17): must be registered before GET/PATCH /:id below,
// or Express would match the literal segment "bulk" against the :id
// param first and route PATCH /reports/bulk/status into the
// single-report handler instead of here — same ordering hazard already
// documented above for GET /me vs GET /:id.
reportsRouter.patch(
  '/bulk/status',
  authenticate,
  requireMinRole(ROLES.MODERATOR),
  reportsController.bulkUpdateReportStatus
);

reportsRouter.get('/:id', authenticate, requireMinRole(ROLES.MODERATOR), reportsController.getReportById);
reportsRouter.patch(
  '/:id/status',
  authenticate,
  requireMinRole(ROLES.MODERATOR),
  reportsController.updateReportStatus
);
