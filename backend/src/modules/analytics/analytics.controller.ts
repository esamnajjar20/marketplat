import { Request, Response, NextFunction } from 'express';
import { analyticsService } from './analytics.service';
import { trackEventsSchema, getAnalyticsSummarySchema } from './analytics.validation';
import { successResponse } from '../../shared/types/api-response.types';

export const analyticsController = {
  // POST /analytics/events — public (see analytics.routes.ts). Always
  // returns 202 regardless of whether the write actually lands. Note
  // (T461): trackEvents IS awaited on the request path — the "fire-
  // and-forget" wording refers to the SERVICE's internal handling of
  // write failures (analytics.service.ts catches them and logs rather
  // than re-throwing), not to this controller returning early. The
  // observable contract is what matters: the client always sees 202,
  // and a write failure never turns into a 5xx.
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
