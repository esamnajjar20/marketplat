import { Request, Response, NextFunction } from 'express';
import { getCachedHomepageWithStatus } from './home.cache'; // HOME-STATUS-HEADER-01
import { getHomepageSchema } from './home.validation';
import { successResponse } from '../../shared/types/api-response.types';

export const homeController = {
  getHomepage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getHomepageSchema.parse({ query: req.query });
      const { value: homepage, status } = await getCachedHomepageWithStatus(query);
      // HOME-STATUS-HEADER-01: expose cache verdict for diagnostics.
      res.setHeader('X-App-Cache', status);
      // Cache-Control is owned by CACHE.LIVE on the route. Keep the controller
      // free of a second TTL source so Redis/HTTP policy cannot drift.
      res.status(200).json(successResponse('Homepage fetched', homepage));
    } catch (error) {
      next(error);
    }
  },
};
