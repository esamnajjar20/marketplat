import { Request, Response, NextFunction } from 'express';
import { analyticsService } from './analytics.service';
import { trackEventsSchema, getAnalyticsSummarySchema } from './analytics.validation';
import { successResponse } from '../../shared/types/api-response.types';

export const analyticsController = {
  // POST /analytics/events — public (see analytics.routes.ts). Always
  // returns 202 regardless of whether the write actually lands (see
  // analytics.service.ts's fire-and-forget error handling) — the
  // client has nothing useful to do with a failure here, and retrying
  // client-side would only risk duplicate events.
  trackEvents: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { body } = trackEventsSchema.parse({ body: req.body });
      await analyticsService.trackEvents(body, req.headers.authorization);
      res.status(202).json(successResponse('Events accepted'));
    } catch (error) {
      next(error);
    }
  },

  // GET /admin/analytics/summary — admin-only, mounted with
  // authenticate+requireAdmin in the router.
  getSummary: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getAnalyticsSummarySchema.parse({ query: req.query });
      const summary = await analyticsService.getSummary(query);
      res.status(200).json(successResponse('Analytics summary fetched', summary));
    } catch (error) {
      next(error);
    }
  },
};
