import { Request, Response, NextFunction } from 'express';
import { reportsService } from './reports.service';
import {
  createReportSchema,
  createTargetReportSchema,
  updateReportStatusSchema,
  getReportsSchema,
  getMyReportsSchema,
  reportIdSchema,
} from './reports.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const reportsController = {
  createReport: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = createReportSchema.parse({ params: req.params, body: req.body });
      const report = await reportsService.createReport(user.userId, params.adId, body);
      res.status(201).json(successResponse('Report submitted', report));
    } catch (error) {
      next(error);
    }
  },

  // FEAT-REPORT-USER-STORE: POST /reports/:targetType/:targetId, targetType
  // restricted to USER|STORE by createTargetReportSchema — AD keeps using
  // the original /reports/ads/:adId route above untouched.
  createTargetReport: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params, body } = createTargetReportSchema.parse({
        params: req.params,
        body: req.body,
      });
      const report = await reportsService.createTargetReport(
        user.userId,
        params.targetType,
        params.targetId,
        body
      );
      res.status(201).json(successResponse('Report submitted', report));
    } catch (error) {
      next(error);
    }
  },

  // FEAT-REPORT-USER-STORE: "بلاغاتي" — GET /reports/me, any authenticated
  // user (not admin-gated, unlike getReports below) sees only their own
  // filed reports.
  getMyReports: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = getMyReportsSchema.parse({ query: req.query });
      const result = await reportsService.getMyReports(user.userId, query);
      res
        .status(200)
        .json(successResponse('Your reports fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getReports: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getReportsSchema.parse({ query: req.query });
      const result = await reportsService.getReports(query);
      res
        .status(200)
        .json(successResponse('Reports fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  getReportById: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = reportIdSchema.parse({ params: req.params });
      const report = await reportsService.getReportById(params.id);
      res.status(200).json(successResponse('Report fetched', report));
    } catch (error) {
      next(error);
    }
  },

  updateReportStatus: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params, body } = updateReportStatusSchema.parse({
        params: req.params,
        body: req.body,
      });
      const report = await reportsService.updateReportStatus(params.id, body);
      res.status(200).json(successResponse('Report status updated', report));
    } catch (error) {
      next(error);
    }
  },
};
