import { Request, Response, NextFunction } from 'express';
import { activityService } from './activity.service';
import { getMyActivitySchema } from './activity.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const activityController = {
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
