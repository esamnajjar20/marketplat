import { Request, Response, NextFunction } from 'express';
import { homeService } from './home.service';
import { getHomepageSchema } from './home.validation';
import { successResponse } from '../../shared/types/api-response.types';

export const homeController = {
  getHomepage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getHomepageSchema.parse({ query: req.query });
      const homepage = await homeService.getHomepage(query);
      // Same cache posture as the individual list endpoints it replaces
      // (/ads, /stores, /service-listings all use SHORT-equivalent
      // 30s+90s SWR) — anonymous homepage traffic is the overwhelming
      // majority of hits, so this is a real CDN win, not just fewer
      // browser round trips.
      res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=90');
      res.setHeader('Vary', 'Authorization');
      res.status(200).json(successResponse('Homepage fetched', homepage));
    } catch (error) {
      next(error);
    }
  },
};
