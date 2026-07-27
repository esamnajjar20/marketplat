import { redis } from '../../config/redis';
import { AppError } from '../errors/AppError';
import crypto from 'crypto';

/**
 * FIX D-10: addImages reads ad.images.length, does slow Cloudinary
 * uploads, then writes the result. Two concurrent addImages calls for
 * the same ad both read the same stale count, both pass the <=10 check,
 * both upload, both write — bypassing the 10-image cap and leaving
 * whichever images get truncated by the DB-level LIMIT as orphaned
 * (already-uploaded, never cleaned up) Cloudinary assets.
 *
 * AUDIT-FIX M-02: the same count-then-write race existed in createAd's
 * per-user active-ad cap check (countActiveByUserId, then create,
 * with no lock in between) — two concurrent createAd calls for the
 * same user could both read a count one under the cap and both
 * proceed, letting a user exceed env.ads.maxPerUser by N-1 ads for N
 * concurrent requests. Rather than duplicate the SET-NX/Lua-release
 * lock plumbing a second time, the primitive below is now shared by
 * both withAdImagesLock (locks a single ad's image list) and
 * withUserAdCreationLock (locks a single user's ad-creation slot) —
 * same mechanism, different keyspace, so the two can never contend
 * with each other.
 *
 * Both are short-lived, best-effort Redis locks (SET NX EX), not a
 * general-purpose distributed lock (no retry/backoff, no reentrancy)
 * — intentionally minimal for these two specific use cases.
 */

const RELEASE_SCRIPT = `
  if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
  end
  return 0
`;

// Exported (previously module-private) so sellerLock.ts can reuse the
// same SET-NX/Lua-release primitive for the seller-profile-creation
// keyspace instead of re-implementing it — same pattern already used
// for bumpAdsCacheVersion (ads.service.ts) to avoid "duplicate logic
// that could silently diverge" between modules.
export const LOCK_NOT_ACQUIRED: unique symbol = Symbol('LOCK_NOT_ACQUIRED');

export async function withRedisLock<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T | typeof LOCK_NOT_ACQUIRED> {
  const token = crypto.randomUUID();

  const acquired = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
  if (acquired !== 'OK') {
    return LOCK_NOT_ACQUIRED;
  }

  try {
    return await fn();
  } finally {
    try {
      await (redis as any).eval(RELEASE_SCRIPT, 1, key, token);
    } catch {
      // If release fails (e.g. transient Redis error), the lock still
      // self-heals via its TTL — no need to throw from a cleanup path.
    }
  }
}

const IMAGE_LOCK_PREFIX = 'ad_images_lock:';
const IMAGE_LOCK_TTL_SECONDS = 30; // generous: covers multi-file Cloudinary upload latency

export class AdImagesLockedError extends AppError {
  constructor(adId: string) {
    super(`Ad ${adId} is currently being updated by another request — try again shortly`, 409);
  }
}

/**
 * Runs `fn` while holding an exclusive lock on `adId`'s image operations.
 * Throws AdImagesLockedError if the lock can't be acquired immediately
 * (no internal retry — callers/clients can retry the request, which is
 * the right behavior for a user-facing "please try again" rather than
 * silently queueing inside the request).
 */
export async function withAdImagesLock<T>(adId: string, fn: () => Promise<T>): Promise<T> {
  const result = await withRedisLock(`${IMAGE_LOCK_PREFIX}${adId}`, IMAGE_LOCK_TTL_SECONDS, fn);
  if (result === LOCK_NOT_ACQUIRED) {
    throw new AdImagesLockedError(adId);
  }
  return result;
}

const AD_CREATION_LOCK_PREFIX = 'ad_creation_lock:';
// Short TTL: this only needs to cover the count-check + DB insert, not
// the (already-parallel, already outside the lock) Cloudinary uploads —
// see the ordering note in ads.service.ts's createAd.
const AD_CREATION_LOCK_TTL_SECONDS = 10;

export class AdCreationLockedError extends AppError {
  constructor() {
    super('Another ad creation request is already in progress for this account — please try again in a moment', 409);
  }
}

/**
 * Runs `fn` while holding an exclusive lock on `userId`'s ad-creation
 * slot, serializing the count-active-ads-then-create sequence so two
 * concurrent createAd calls for the same user can't both pass the
 * per-user active-ad cap check before either has committed its insert.
 */
export async function withUserAdCreationLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const result = await withRedisLock(
    `${AD_CREATION_LOCK_PREFIX}${userId}`,
    AD_CREATION_LOCK_TTL_SECONDS,
    fn
  );
  if (result === LOCK_NOT_ACQUIRED) {
    throw new AdCreationLockedError();
  }
  return result;
}
