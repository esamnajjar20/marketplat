import { Request, Response, NextFunction } from 'express';
import { isHomepageDegraded } from './home.service';
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
      // Same cache posture as the list endpoints it replaces (/ads,
      // /stores, /products, /service-listings: 30s + 30s swr, i.e.
      // CACHE.LIVE) — anonymous homepage traffic is the overwhelming
      // majority of hits, so this is a real CDN win. FIX
      // CACHE-HTTP-STALENESS-02: swr was 90s, letting a removed ad
      // linger in browser/CDN copies for up to 2 minutes.
      // A degraded page (some section failed → null) must not be pinned in
      // the CDN for 2 minutes; let it recover on the next request.
      // HOME-VARY-FIX-01: overwrite the Vary header that the global CORS
      // middleware sets (credentials:true forces `Vary: Origin`). Cloudflare
      // refuses to cache any response that Varies on Origin, so /home was
      // never cached at the edge despite the Cache-Control below. /home is
      // identical for every viewer (no per-user fields), so Origin is not a
      // legitimate cache key here — only Accept-Encoding matters.
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader(
        'Cache-Control',
        isHomepageDegraded(homepage)
          ? 'public, max-age=5'
          : 'public, s-maxage=60, max-age=30, stale-while-revalidate=300',
      );
      res.status(200).json(successResponse('Homepage fetched', homepage));
    } catch (error) {
      next(error);
    }
  },
};
