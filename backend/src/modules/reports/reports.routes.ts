import { Router } from 'express';
import { reportsController } from './reports.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';
import { reportRateLimit } from '../../middlewares/rateLimit.middleware';

export const reportsRouter = Router();

reportsRouter.post('/ads/:adId', authenticate, reportRateLimit, reportsController.createReport);
reportsRouter.get('/', authenticate, requireAdmin, reportsController.getReports);
reportsRouter.get('/:id', authenticate, requireAdmin, reportsController.getReportById);
reportsRouter.patch(
  '/:id/status',
  authenticate,
  requireAdmin,
  reportsController.updateReportStatus
);
