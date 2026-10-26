import { Request, Response, NextFunction } from 'express';
import { cachePolicy } from '../shared/cache/cachePolicy';
import { purgeAwareSharedMaxAge } from '../../shared/cache/edgePurge';

/**
 * Sets Cache-Control headers for public, cacheable responses.
 * Use on GET endpoints that return data safe to cache in CDN/browser.
 *
 * @param maxAge     seconds to cache in browser/CDN
 * @param swr        stale-while-revalidate seconds (optional)
 */
export const cacheControl =
  (maxAge: number, swr?: number, sharedMaxAge?: number) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const headers = req.headers ?? {};
    const cookie = headers.cookie ?? '';
    const hasSessionCookie = /(?:^|;\s*)(?:refreshToken|app_has_session)=/.test(cookie);
    const hasAuth = Boolean(headers.authorization || hasSessionCookie);
    // Authenticated responses are never shared-cacheable. This avoids relying
    // on a CDN's interpretation of Vary: Authorization and prevents a token-
    // fragmented public cache from retaining viewer-specific fields.
    if (hasAuth) {
      res.setHeader('Cache-Control', 'private, no-cache, no-transform');
      res.setHeader('Vary', 'Authorization, Cookie');
    } else {
      const directives = [`public`, `max-age=${maxAge}`];
      if (sharedMaxAge) directives.push(`s-maxage=${sharedMaxAge}`);
      if (swr) directives.push(`stale-while-revalidate=${swr}`);
      res.setHeader('Cache-Control', directives.join(', '));
      // Even public responses should declare the auth dimension explicitly:
      // intermediaries must not reuse a response across authorization states.
      res.setHeader('Vary', 'Authorization');
    }
    next();
  };

/** Route-level owner of HTTP cache headers. Controllers must never set Cache-Control. */
type HttpCachePolicyName =
  | 'publicLive'
  | 'publicDetail'
  | 'publicHome'
  | 'recommendations'
  | 'reference'
  | 'personal'
  | 'messages'
  | 'security';

export const cachePolicyControl =
  (policyName: HttpCachePolicyName) =>
  (_req: Request, res: Response, next: NextFunction): void => {
    const policy = cachePolicy(policyName);
    const http = policy.http;
    if (http.maxAgeSec === 0) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Vary', 'Authorization, Cookie');
      next();
      return;
    }
    const directives = ['public', `max-age=${http.maxAgeSec}`];
    // Edge/CDN TTL can be longer than the browser's — the Worker reads
    // s-maxage first and falls back to max-age.
    if ('sharedMaxAgeSec' in http && http.sharedMaxAgeSec)
      directives.push(`s-maxage=${http.sharedMaxAgeSec}`);
    if (http.staleWhileRevalidateSec)
      directives.push(`stale-while-revalidate=${http.staleWhileRevalidateSec}`);
    const hasAuth = Boolean(
      _req.headers?.authorization ||
      /(?:^|;\s*)(?:refreshToken|app_has_session)=/.test(_req.headers?.cookie ?? '')
    );
    if (hasAuth) {
      res.setHeader('Cache-Control', 'private, no-cache, no-transform');
      res.setHeader('Vary', 'Authorization, Cookie');
    } else {
      res.setHeader('Cache-Control', directives.join(', '));
    }
    next();
  };

// Extract s-maxage from the policy union without a cast, keeping type safety.
const sharedMaxOf = (p: object): number | undefined => {
  const v = (p as { sharedMaxAgeSec?: unknown }).sharedMaxAgeSec;
  return typeof v === 'number' ? v : undefined;
};

// Presets — values come from the canonical cache policy. Keep these names as
// compatibility aliases for existing routes; the policy itself is not defined here.
const PUBLIC_LIVE = cachePolicy('publicLive').http;
const PUBLIC_DETAIL = cachePolicy('publicDetail').http;
const REFERENCE = cachePolicy('reference').http;

export const CACHE = {
  STATIC: cacheControl(
    REFERENCE.maxAgeSec,
    REFERENCE.staleWhileRevalidateSec,
    sharedMaxOf(REFERENCE)
  ),
  LONG: cacheControl(
    REFERENCE.maxAgeSec,
    REFERENCE.staleWhileRevalidateSec,
    sharedMaxOf(REFERENCE)
  ),
  SHORT: cacheControl(
    PUBLIC_LIVE.maxAgeSec,
    PUBLIC_LIVE.staleWhileRevalidateSec,
    sharedMaxOf(PUBLIC_LIVE)
  ),
  MEDIUM: cacheControl(
    PUBLIC_DETAIL.maxAgeSec,
    PUBLIC_DETAIL.staleWhileRevalidateSec,
    sharedMaxOf(PUBLIC_DETAIL)
  ),
  LIVE: cacheControl(
    PUBLIC_LIVE.maxAgeSec,
    PUBLIC_LIVE.staleWhileRevalidateSec,
    sharedMaxOf(PUBLIC_LIVE)
  ),
  // Ads routes only: every ad mutation purges the edge by Cache-Tag (see
  // shared/cache/edgePurge.ts), so when purging is configured the edge may keep
  // these far longer than the policy's s-maxage. The browser max-age and
  // stale-while-revalidate are untouched, and with purging OFF these are
  // byte-identical to LIVE.
  ADS_LIST: cacheControl(
    PUBLIC_LIVE.maxAgeSec,
    PUBLIC_LIVE.staleWhileRevalidateSec,
    purgeAwareSharedMaxAge('adsList', sharedMaxOf(PUBLIC_LIVE))
  ),
  ADS_DETAIL: cacheControl(
    PUBLIC_LIVE.maxAgeSec,
    PUBLIC_LIVE.staleWhileRevalidateSec,
    purgeAwareSharedMaxAge('adsDetail', sharedMaxOf(PUBLIC_LIVE))
  ),
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
    if (typeof res.removeHeader === 'function') res.removeHeader('Vary');
    next();
  },
};
