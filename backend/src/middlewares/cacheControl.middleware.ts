import { Request, Response, NextFunction } from 'express';
import { cachePolicy } from '../shared/cache/cachePolicy';

/**
 * Sets Cache-Control headers for public, cacheable responses.
 * Use on GET endpoints that return data safe to cache in CDN/browser.
 *
 * @param maxAge     seconds to cache in browser/CDN
 * @param swr        stale-while-revalidate seconds (optional)
 */
export const cacheControl =
  (maxAge: number, swr?: number) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const cookie = req.headers.cookie ?? '';
    const hasSessionCookie = /(?:^|;\s*)(?:refreshToken|app_has_session)=/.test(cookie);
    const hasAuth = Boolean(req.headers.authorization || hasSessionCookie);
    // Authenticated responses are never shared-cacheable. This avoids relying
    // on a CDN's interpretation of Vary: Authorization and prevents a token-
    // fragmented public cache from retaining viewer-specific fields.
    if (hasAuth) {
      res.setHeader('Cache-Control', 'private, no-cache, no-transform');
      res.setHeader('Vary', 'Authorization, Cookie');
    } else {
      const directives = [`public`, `max-age=${maxAge}`];
      if (swr) directives.push(`stale-while-revalidate=${swr}`);
      res.setHeader('Cache-Control', directives.join(', '));
    }
    next();
  };

/** Route-level owner of HTTP cache headers. Controllers must never set Cache-Control. */
type HttpCachePolicyName = 'publicLive' | 'publicDetail' | 'publicHome' | 'recommendations' | 'reference' | 'personal' | 'messages' | 'security';

export const cachePolicyControl = (policyName: HttpCachePolicyName) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    const policy = cachePolicy(policyName);
    const http = policy.http;
    if (http.maxAgeSec === 0) {
      res.setHeader('Cache-Control', 'private, no-cache, no-transform');
      res.setHeader('Vary', 'Authorization, Cookie');
      next();
      return;
    }
    const directives = ['public', `max-age=${http.maxAgeSec}`];
    if (http.staleWhileRevalidateSec) directives.push(`stale-while-revalidate=${http.staleWhileRevalidateSec}`);
    const hasAuth = Boolean(_req.headers.authorization || /(?:^|;\s*)(?:refreshToken|app_has_session)=/.test(_req.headers.cookie ?? ''));
    if (hasAuth) {
      res.setHeader('Cache-Control', 'private, no-cache, no-transform');
      res.setHeader('Vary', 'Authorization, Cookie');
    } else {
      res.setHeader('Cache-Control', directives.join(', '));
    }
    next();
  };

// Presets — values come from the canonical cache policy. Keep these names as
// compatibility aliases for existing routes; the policy itself is not defined here.
const PUBLIC_LIVE = cachePolicy('publicLive').http;
const PUBLIC_DETAIL = cachePolicy('publicDetail').http;
const REFERENCE = cachePolicy('reference').http;

export const CACHE = {
  STATIC: cacheControl(REFERENCE.maxAgeSec, REFERENCE.staleWhileRevalidateSec),
  LONG: cacheControl(REFERENCE.maxAgeSec, REFERENCE.staleWhileRevalidateSec),
  SHORT: cacheControl(PUBLIC_LIVE.maxAgeSec, PUBLIC_LIVE.staleWhileRevalidateSec),
  MEDIUM: cacheControl(PUBLIC_DETAIL.maxAgeSec, PUBLIC_DETAIL.staleWhileRevalidateSec),
  LIVE: cacheControl(PUBLIC_LIVE.maxAgeSec, PUBLIC_LIVE.staleWhileRevalidateSec),
  PUBLIC_HOME: cachePolicyControl('publicHome'),
  PERSONAL: cachePolicyControl('personal'),
  MESSAGES: cachePolicyControl('messages'),
  SECURITY: cachePolicyControl('security'),
  STREAM: (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    next();
  },
  NONE: (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Cache-Control', 'no-store');
    res.removeHeader('Vary');
    next();
  },
};
