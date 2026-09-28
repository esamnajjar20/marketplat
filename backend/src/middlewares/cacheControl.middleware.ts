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
    // FIX CACHE-VARY-01: every `public` response must key its cache on
    // the Authorization header. Without this, a shared cache (browser
    // on a family/cafe device, a caching corporate proxy, or a
    // Cloudflare Cache Rule that overrides the default "don't cache
    // authenticated requests" behavior) treats user A's response and
    // user B's response as the same object — so user B can be served
    // user A's content for the same URL. Cloudflare's own defaults
    // avoid the worst of this in practice (Authorization-bearing
    // requests bypass the cache), but that default is not guaranteed
    // and is trivially overridden by a Cache Rule — the response must
    // be correct on its own, not dependent on an external default.
    //
    // Vary keys on the header's *presence*, not its value — one cache
    // entry for "has Authorization", one for "doesn't". That's exactly
    // the split this app needs: anonymous vs authenticated viewers of
    // the same public list (e.g. an ad list where `isFavorited` is
    // computed for the current viewer). It does NOT fragment per
    // distinct token, so CDN efficiency for the anonymous case (the
    // overwhelming majority of these routes' traffic) is unchanged.
    res.setHeader('Vary', 'Authorization');
    next();
  };

// Presets
export const CACHE = {
  // Static-ish data: categories tree (1 hour)
  LONG: cacheControl(3600, 600),
  // Public lists — N2 longer TTL for weak nets (90s + 60s SWR)
  SHORT: cacheControl(90, 60),
  // Individual public resources (ad/product detail)
  MEDIUM: cacheControl(120, 60),
  // FIX CACHE-HTTP-STALENESS-01: ad lists/details are invalidated in Redis
  // immediately (bumpAdsCacheVersion), but a browser/CDN copy can't be
  // purged — with SHORT/MEDIUM an admin takedown or a "sold" flip stayed
  // visible for up to max-age + swr (~3 min). 30s + 30s bounds that to
  // about a minute while still absorbing repeat hits on weak networks
  // (offline fallback is handled by the service worker, not by max-age).
  LIVE: cacheControl(30, 30),
  // No cache: authenticated or mutating routes
  NONE: (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  },
};
