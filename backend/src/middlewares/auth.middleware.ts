import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../shared/utils/jwt';
import { tokenStore, getBlacklistKey } from '../shared/utils/tokenStore';
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
      // AUDIT-FIX M-01: derives the user-cache key from userCache.ts's
      // single exported getUserCacheKey() — same rationale as
      // getBlacklistKey() above: one source of truth for the key
      // format instead of two independently-editable copies.
      pipeline.get(getUserCacheKey(payload.userId));
      const results = await pipeline.exec();

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
      throw new UnauthorizedError('Token has been revoked');
    }

    // Resolve user — from pipeline result or DB fallback
    let user: { id: string; role: string; isActive: boolean } | null = null;
    if (userCacheResult) {
      user = JSON.parse(userCacheResult);
    } else {
      // Cache miss — fetch from DB and warm cache (Single Flight handled in userCache)
      user = await userCache.getOrFetch(payload.userId);
    }

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Account is deactivated or not found');
    }

    // Inject role from cache (not from JWT — role changes are immediate)
    req.user = { ...payload, role: user.role };

    // Update lastSeen async — fire and forget, never blocks response
    tokenStore.updateSessionLastSeen(payload.userId, payload.sessionId).catch(() => {});

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      next(new UnauthorizedError('Invalid or expired token'));
    }
  }
};
