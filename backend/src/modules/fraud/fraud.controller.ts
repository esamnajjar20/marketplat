import { Request, Response, NextFunction } from 'express';
import { fraudService } from './fraud.service';
import {
  getFlaggedAdsSchema,
  getFraudSignalsSchema,
  signalIdSchema,
  adIdSchema,
  manualFlagSchema,
} from './fraud.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const fraudController = {
  /** GET /admin/fraud/ads — flagged ads queue, highest risk first. */
  getFlaggedAds: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getFlaggedAdsSchema.parse({ query: req.query });
      const result = await fraudService.getFlaggedAds(query);
      res
        .status(200)
        .json(successResponse('Flagged ads fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  /** GET /admin/fraud/signals — raw signal log, filterable by type/user/ad/reviewed. */
  getSignals: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getFraudSignalsSchema.parse({ query: req.query });
      const result = await fraudService.getSignals(query);
      res
        .status(200)
        .json(successResponse('Fraud signals fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },

  /** PATCH /admin/fraud/signals/:id/review — marks one signal as reviewed. */
  reviewSignal: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { params } = signalIdSchema.parse({ params: req.params });
      const signal = await fraudService.reviewSignal(params.id, admin.userId);
      res.status(200).json(successResponse('Fraud signal reviewed', signal));
    } catch (error) {
      next(error);
    }
  },

  /** PATCH /admin/fraud/ads/:adId/clear — admin decided a flagged ad is legitimate. */
  clearAdFlag: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { params } = adIdSchema.parse({ params: req.params });
      await fraudService.clearAdFlag(params.adId, admin.userId);
      res.status(200).json(successResponse('Ad flag cleared'));
    } catch (error) {
      next(error);
    }
  },

  /** POST /admin/fraud/ads/:adId/flag — manual admin flag, outside the automated scoring path. */
  manualFlag: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const admin = requireUser(req);
      const { params, body } = manualFlagSchema.parse({ params: req.params, body: req.body });
      await fraudService.manualFlag(params.adId, body, admin.userId);
      res.status(200).json(successResponse('Ad flagged for review'));
    } catch (error) {
      next(error);
    }
  },
};
