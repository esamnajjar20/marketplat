import { reportBackgroundFailure } from '../shared/utils/backgroundTask';
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../shared/utils/jwt';
import {
  tokenStore,
  getBlacklistKey,
  peekBlacklistL1,
  rememberBlacklistL1,
} from '../shared/utils/tokenStore';
import { userCache, getUserCacheKey } from '../shared/utils/userCache';
import { UnauthorizedError } from '../shared/errors/UnauthorizedError';
import { env } from '../config/env';
import { redis } from '../config/redis';
import { logger } from '../shared/utils/logger';

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

    const token = authHeader.split(' ')[1];

    // Verify JWT first (CPU-only, no I/O) — fail fast before hitting Redis
    const payload = verifyAccessToken(token);

    // UPSTASH-SAVE: مسار ساخن بدون Redis
    const localBl = peekBlacklistL1(token);
    const localUser = userCache.peek(payload.userId);
    if (localBl === false && localUser && localUser.isActive) {
      req.user = { ...payload, role: localUser.role };
      tokenStore.updateSessionLastSeen(payload.userId, payload.sessionId).catch((error) => reportBackgroundFailure('backend/src/middlewares/auth.middleware.ts', error));
      next();
      return;
    }
    if (localBl === true) {
      throw new UnauthorizedError('Token has been revoked');
    }

    // P-02: batch both Redis reads into one pipeline round-trip
    // [0] = blacklist check, [1] = user cache
    let blacklistResult: string | null = null;
    let userCacheResult: string | null = null;

    try {
      const pipeline = redis.pipeline();
      // BUGFIX (found during a post-implementation code audit):
      // previously built this key inline as `BLACKLIST_PREFIX +
      // hashToken(token)`, duplicating shared/utils/tokenStore.ts's
      // own (unused) isBlacklisted() key logic — two independent,
      // silently-divergable copies of the same construction. Now
      // derives it from tokenStore's single exported
      // getBlacklistKey(), while still issuing the actual Redis
      // command as part of this file's own batched pipeline (P-02) —
      // that batching is the reason this couldn't just call
      // tokenStore.isBlacklisted() directly, which does its own
      // standalone redis.get().
      pipeline.get(getBlacklistKey(token));
      // derives the user-cache key from userCache.ts's
      // single exported getUserCacheKey() — same rationale as
      // getBlacklistKey() above: one source of truth for the key
      // format instead of two independently-editable copies.
      pipeline.get(getUserCacheKey(payload.userId));
      const results = await pipeline.exec();

      // T553 — pipeline.exec() resolves even when an individual
      // command failed; the failure shows up as [err, null] at that
      // slot. Reading only [1] (the value) silently turns a per-command
      // error into "no data" — for the blacklist slot that's a
      // fail-open under BLACKLIST_STRICT (a revoked token passes).
      // Surface any per-command error by throwing, so the surrounding
      // catch applies the strict/dev policy as intended.
      const blacklistCmdErr = results?.[0]?.[0];
      const userCacheCmdErr = results?.[1]?.[0];
      if (blacklistCmdErr || userCacheCmdErr) {
        throw blacklistCmdErr ?? userCacheCmdErr;
      }

      // pipeline.exec() returns [[err, val], [err, val], ...]
      blacklistResult = (results?.[0]?.[1] as string | null) ?? null;
      userCacheResult = (results?.[1]?.[1] as string | null) ?? null;
    } catch (err) {
      // Redis unavailable — strict mode rejects, dev mode allows
      if (env.security.blacklistStrict) {
        logger.error('Redis unavailable during auth — rejecting (strict mode)');
        throw new UnauthorizedError('Authentication service unavailable');
      }
      logger.warn('Redis unavailable during auth — allowing (dev mode)');
    }

    // Blacklist check
    if (blacklistResult !== null) {
      rememberBlacklistL1(token, true);
      throw new UnauthorizedError('Token has been revoked');
    }
    rememberBlacklistL1(token, false);

    // Resolve user — from pipeline result or DB fallback
    let user: { id: string; role: string; isActive: boolean } | null = null;
    if (userCacheResult) {
      user = JSON.parse(userCacheResult);
      if (user) void userCache.set(user);
    } else {
      user = await userCache.getOrFetch(payload.userId);
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Account is deactivated or not found');
    }

    // Inject role from cache (not from JWT — role changes are immediate)
    req.user = { ...payload, role: user.role };

    // Update lastSeen async — fire and forget, never blocks response
    tokenStore.updateSessionLastSeen(payload.userId, payload.sessionId).catch((error) => reportBackgroundFailure('backend/src/middlewares/auth.middleware.ts', error));

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
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
    const token = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);
    const localBl = peekBlacklistL1(token);
    if (localBl === true) {
      next();
      return;
    }
    // this path previously read only
    // the L1 cache and never consulted Redis, unlike `authenticate`
    // above. Between a logout (which writes the blacklist key to Redis
    // and broadcasts the L1 invalidation to every worker) and the
    // pub/sub message actually landing in this process, the revoked
    // token stayed accepted on every public-read route — the ad
    // detail page, the seller profile, the search results — for the
    // duration of the broadcast latency, with no upper bound if a
    // worker was partitioned from the pub/sub channel. Same pipeline
    // check as `authenticate`, but degrading to anonymous on Redis
    // failure rather than 401: the whole point of this middleware is
    // to never block public reads, so a Redis blip must not turn
    // every public page into a login wall for logged-in users.
    if (localBl === undefined) {
      try {
        const revoked = await redis.get(getBlacklistKey(token));
        if (revoked !== null) {
          rememberBlacklistL1(token, true);
          next();
          return;
        }
        rememberBlacklistL1(token, false);
      } catch {
        // Redis unavailable — treat as anonymous (do not set req.user).
        next();
        return;
      }
    }
    const localUser = userCache.peek(payload.userId);
    if (localUser && localUser.isActive) {
      req.user = { ...payload, role: localUser.role };
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
