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
      // Same cache posture as the list endpoints it replaces (/ads,
      // /stores, /products, /service-listings: 30s + 30s swr, i.e.
      // CACHE.LIVE) — anonymous homepage traffic is the overwhelming
      // majority of hits, so this is a real CDN win. FIX
      // CACHE-HTTP-STALENESS-02: swr was 90s, letting a removed ad
      // linger in browser/CDN copies for up to 2 minutes.
      // A degraded page (some section failed → null) must not be pinned in
      // the CDN for 2 minutes; let it recover on the next request.
      res.setHeader(
        'Cache-Control',
        isHomepageDegraded(homepage)
          ? 'public, max-age=5'
          : 'public, max-age=30, stale-while-revalidate=30',
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
