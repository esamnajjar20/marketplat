import { Request, Response, NextFunction } from 'express';
import { activityService } from './activity.service';
import { sellersService } from '../sellers/sellers.service';
import { getMyActivitySchema } from './activity.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const activityController = {
  /**
   * Dashboard-only aggregate: the dashboard renders its recent activity
   * and seller attention counters together. Keep the full activity
   * timeline endpoint independent so its filters/pagination stay lazy.
   */
  getDashboardOverview: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      // Keep the two panels failure-isolated: a temporary failure in one
      // data source must not hide the other panel from the dashboard.
      const [activityResult, attentionResult] = await Promise.allSettled([
        activityService.getMyActivity(user.userId, { limit: 8 }),
        sellersService.getMyAttention(user.userId),
      ]);
      res.status(200).json(successResponse('Dashboard overview fetched', {
        activity: activityResult.status === 'fulfilled' ? activityResult.value : null,
        attention: attentionResult.status === 'fulfilled' ? attentionResult.value : null,
        failures: {
          activity: activityResult.status === 'rejected',
          attention: attentionResult.status === 'rejected',
        },
      }));
    } catch (error) {
      next(error);
    }
  },
  // GET /activity — the caller's own timeline only. No id-scoped GET
  // exists (same reasoning as notifications.routes.ts's own comment):
  // nothing needs to fetch a single activity row by id outside the list.
  getMyActivity: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = getMyActivitySchema.parse({ query: req.query });
      const result = await activityService.getMyActivity(user.userId, query);
      res
        .status(200)
        .json(successResponse('Activity fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },
};
