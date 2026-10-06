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
    // every `public` response must key its cache on
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
  // Immutable-ish data: 24h CDN TTL, 1h browser TTL, 1h SWR.
  // Reserved for categories, service-types, store-types — nothing
  // user-editable mutates them; only admin actions do, and those
  // bump the Redis generation key which invalidates the edge cache.
  STATIC: cacheControl(86400, 3600),
  // Reference data: categories tree, 2h
  LONG: cacheControl(7200, 900),
  // Public lists — N2 longer TTL for weak nets (90s + 60s SWR)
  SHORT: cacheControl(180, 90),
  // Individual public resources (ad/product detail)
  MEDIUM: cacheControl(240, 120),
  // ad lists/details are invalidated in Redis
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
