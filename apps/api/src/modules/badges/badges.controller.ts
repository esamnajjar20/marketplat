import { Request, Response, NextFunction } from 'express';
import { badgesService } from './badges.service';
import { storeIdParamSchema, providerIdParamSchema } from './badges.validation';
import { successResponse } from '../../shared/types/api-response.types';

export const badgesController = {
  // Public — no auth. A store's badges are part of its public profile,
  // same visibility level as its rating or follower count.
  getStoreBadges: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = storeIdParamSchema.parse({ params: req.params });
      const badges = await badgesService.getStoreBadges(params.storeId);
      res.status(200).json(successResponse('Badges fetched', badges));
    } catch (error) {
      next(error);
    }
  },

  // Public — no auth, same visibility level as getStoreBadges above.
  getProviderBadges: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { params } = providerIdParamSchema.parse({ params: req.params });
      const badges = await badgesService.getProviderBadges(params.providerId);
      res.status(200).json(successResponse('Badges fetched', badges));
    } catch (error) {
      next(error);
    }
  },
};
