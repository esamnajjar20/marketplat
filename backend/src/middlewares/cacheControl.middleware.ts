import { Request, Response, NextFunction } from 'express';

/**
 * Sets Cache-Control headers for public, cacheable responses.
 * Use on GET endpoints that return data safe to cache in CDN/browser.
 *
 * @param maxAge     seconds to cache in browser/CDN
 * @param swr        stale-while-revalidate seconds (optional)
 */
export const cacheControl =
  (maxAge: number, swr?: number) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    const directives = [`public`, `max-age=${maxAge}`];
    if (swr) directives.push(`stale-while-revalidate=${swr}`);
    res.setHeader('Cache-Control', directives.join(', '));
    next();
  };

// Presets
export const CACHE = {
  // Static-ish data: categories tree (1 hour)
  LONG: cacheControl(3600, 600),
  // Frequently changing lists: ads feed (30s + 30s swr)
  SHORT: cacheControl(30, 30),
  // Individual resources: ad detail (60s)
  MEDIUM: cacheControl(60, 30),
  // No cache: authenticated or mutating routes
  NONE: (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  },
};
