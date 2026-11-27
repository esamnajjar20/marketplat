import { reportBackgroundFailure } from '../shared/jobs/backgroundTask';
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../shared/auth/jwt';
import {
  tokenStore,
  getBlacklistKey,
  rememberBlacklistL1,
  getSessionMetadataKey,
} from '../shared/auth/tokenStore';
import { userCache, getUserCacheKey } from '../shared/cache/userCache';
import { UnauthorizedError } from '../shared/errors/UnauthorizedError';
import { ForbiddenError } from '../shared/errors/ForbiddenError';
import { sessionRedis as redis } from '../config/redis';
import { logger } from '../shared/observability/logger';

function isProfileCompletionExempt(req: Request): boolean {
  const path = `${req.baseUrl ?? ''}${req.path ?? ''}`.replace(/\/{2,}/g, '/');
  const method = String(req.method ?? 'GET').toUpperCase();

  if (path.endsWith('/users/me') && ['GET', 'PATCH', 'DELETE'].includes(method)) return true;
  if (path.endsWith('/users/me/bootstrap') && method === 'GET') return true;
  if (path.endsWith('/users/me/delete-confirmed') && method === 'POST') return true;
  if (path.endsWith('/users/me/password') && method === 'POST') return true;
  if (path.endsWith('/auth/logout') && method === 'POST') return true;
  if (path.endsWith('/auth/logout-all') && method === 'POST') return true;
  if (path.endsWith('/auth/sessions') && method === 'GET') return true;
  if (/\/auth\/sessions\/[^/]+$/.test(path) && method === 'DELETE') return true;
  if (path.endsWith('/auth/resend-verification') && method === 'POST') return true;
  if (path.endsWith('/auth/mobile/google/delete/start') && method === 'POST') return true;
  return false;
}

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) throw new UnauthorizedError('No token provided');

    const payload = verifyAccessToken(token);
    if (!payload.userId || !payload.sessionId || !payload.jti) {
      throw new UnauthorizedError('Invalid or expired token');
    }

    // Every access token is bound to a live Redis session record. The old
    // L1 fast path checked only token blacklist + user state and therefore
    // let Access Tokens from revoked sessions survive until JWT expiry.
    // Do not cache positive session checks: revocation must take effect on
    // every worker on the very next request.
    let blacklistResult: string | null;
    let userCacheResult: string | null;
    let sessionExists: number;
    try {
      const pipeline = redis.pipeline();
      pipeline.get(getBlacklistKey(token));
      pipeline.get(getUserCacheKey(payload.userId));
      pipeline.exists(getSessionMetadataKey(payload.userId, payload.sessionId));
      const results = await pipeline.exec();
      const commandError = results?.find(result => result?.[0])?.[0];
      if (commandError) throw commandError;
      if (!results || results.length !== 3) {
        throw new Error('Unexpected authentication pipeline result');
      }
      blacklistResult = (results[0]?.[1] as string | null) ?? null;
      userCacheResult = (results[1]?.[1] as string | null) ?? null;
      sessionExists = Number(results[2]?.[1] ?? 0);
    } catch (error) {
      logger.error('Redis unavailable during session authentication', { error });
      // The session ledger lives only in Redis. Failing open here would
      // defeat logout-all/revoke-session precisely during an outage.
      throw new UnauthorizedError(
        'Authentication service unavailable',
        'AUTH_SERVICE_UNAVAILABLE'
      );
    }

    if (blacklistResult !== null) {
      rememberBlacklistL1(token, true);
      throw new UnauthorizedError('Token has been revoked');
    }
    rememberBlacklistL1(token, false);

    if (sessionExists !== 1) {
      throw new UnauthorizedError('Session has been revoked or expired', 'SESSION_EXPIRED');
    }

    let user: import('../shared/cache/userCache').CachedUser | null = null;
    if (userCacheResult) {
      try {
        user = JSON.parse(userCacheResult) as import('../shared/cache/userCache').CachedUser;
      } catch {
        user = null;
      }
    }

    // Cache entries from before the onboarding projection existed are stale.
    // Evict and refetch rather than allowing an undefined flag to bypass it.
    if (user && typeof user.needsProfileCompletion !== 'boolean') {
      await userCache.invalidate(payload.userId);
      user = null;
    }
    if (!user) user = await userCache.getOrFetch(payload.userId);
    if (user && typeof user.needsProfileCompletion !== 'boolean') {
      await userCache.invalidate(payload.userId);
      user = await userCache.getOrFetch(payload.userId);
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Account is deactivated or not found');
    }
    if (typeof user.needsProfileCompletion !== 'boolean') {
      throw new UnauthorizedError(
        'Account state is temporarily unavailable',
        'ACCOUNT_STATE_UNAVAILABLE'
      );
    }

    req.user = {
      ...payload,
      role: user.role,
      needsProfileCompletion: user.needsProfileCompletion,
    };

    if (user.needsProfileCompletion && !isProfileCompletionExempt(req)) {
      throw new ForbiddenError(
        'Complete your profile before using the marketplace',
        'PROFILE_COMPLETION_REQUIRED'
      );
    }

    tokenStore
      .updateSessionLastSeen(payload.userId, payload.sessionId)
      .catch(error =>
        reportBackgroundFailure('apps/api/src/middlewares/auth.middleware.ts', error)
      );

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      next(error);
    } else {
      next(new UnauthorizedError('Invalid or expired token'));
    }
  }
};

/**
 * Soft auth for public reads. Sets req.user when a valid Bearer token is present;
 * otherwise continues anonymously (never 401).
 */
/**
 * Optional auth that fully resolves a presented Bearer token before a route
 * uses viewer-specific data. Unlike optionalAuthenticate (which intentionally
 * avoids a cold user lookup), this delegates to authenticate and converts an
 * auth failure to an anonymous request. Use only on small, personalized public
 * payloads where silently omitting the viewer would produce incorrect UI state.
 */
export const optionalAuthenticateWithUserLookup = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  if (!req.headers.authorization?.startsWith('Bearer ')) {
    next();
    return;
  }

  try {
    await authenticate(req, res, (error?: unknown) => {
      if (error) {
        delete req.user;
        next();
        return;
      }
      next();
    });
  } catch {
    delete req.user;
    next();
  }
};

export const optionalAuthenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      next();
      return;
    }
    const token = authHeader.slice('Bearer '.length).trim();
    const payload = verifyAccessToken(token);
    if (!payload.userId || !payload.sessionId || !payload.jti) {
      next();
      return;
    }

    // Public routes remain public during an auth-infrastructure outage, but
    // a viewer identity is attached only after authoritative session checks.
    const pipeline = redis.pipeline();
    pipeline.get(getBlacklistKey(token));
    pipeline.exists(getSessionMetadataKey(payload.userId, payload.sessionId));
    const results = await pipeline.exec();
    const commandError = results?.find(result => result?.[0])?.[0];
    if (commandError || !results || results.length !== 2) {
      next();
      return;
    }

    const blacklisted = results[0]?.[1] != null;
    const sessionExists = Number(results[1]?.[1] ?? 0) === 1;
    if (blacklisted || !sessionExists) {
      if (blacklisted) rememberBlacklistL1(token, true);
      next();
      return;
    }
    rememberBlacklistL1(token, false);

    const localUser = userCache.peek(payload.userId);
    if (localUser?.isActive && localUser.needsProfileCompletion === false) {
      req.user = {
        ...payload,
        role: localUser.role,
        needsProfileCompletion: false,
      };
    }
    next();
  } catch {
    next();
  }
};

/**
 * single, safe extractor for the bearer
 * token from an incoming request. Replaces the pattern
 * `req.headers.authorization!.split(' ')[1]` that lived inline in
 * auth.controller.ts (logout, logoutAll) and users.controller.ts
 * (changePassword) — the non-null assertion there is technically safe
 * because the `authenticate` middleware guarantees the header is
 * present on those routes, but any future refactor that drops that
 * middleware from a route turns the assertion into a runtime TypeError
 * instead of a clean 401. This helper returns `undefined` for a
 * missing or malformed header, letting callers decide whether that's
 * an error (it always is on these routes) with explicit handling
 * instead of an implicit crash.
 *
 * Returns the token WITHOUT the "Bearer " prefix, or undefined.
 */
export function getBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token || undefined;
}
