import { Request, Response, NextFunction } from 'express';
import { isHomepageDegraded } from './home.service';
import { getCachedHomepage } from './home.cache';
import { getHomepageSchema } from './home.validation';
import { successResponse } from '../../shared/types/api-response.types';

export const homeController = {
  getHomepage: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getHomepageSchema.parse({ query: req.query });
      const homepage = await getCachedHomepage(query);
      // Same cache posture as the individual list endpoints it replaces
      // (/ads, /stores, /service-listings all use SHORT-equivalent
      // 30s+90s SWR) — anonymous homepage traffic is the overwhelming
      // majority of hits, so this is a real CDN win, not just fewer
      // browser round trips.
      // A degraded page (some section failed → null) must not be pinned in
      // the CDN for 2 minutes; let it recover on the next request.
      res.setHeader(
        'Cache-Control',
        isHomepageDegraded(homepage)
          ? 'public, max-age=5'
          : 'public, max-age=30, stale-while-revalidate=90',
      );
      // No Vary: Authorization — /home is identical for every viewer (no
      // per-user fields such as isFavorited), so keying the cache on the
      // header would only fragment it.
      res.status(200).json(successResponse('Homepage fetched', homepage));
    } catch (error) {
      next(error);
    }
  },
};
