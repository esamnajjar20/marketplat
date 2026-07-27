import { Request, Response, NextFunction } from 'express';
import { reportsService } from './reports.service';
import {
  createReportSchema,
  updateReportStatusSchema,
  getReportsSchema,
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
