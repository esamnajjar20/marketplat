import { redis } from '../../config/redis';
import { AppError } from '../errors/AppError';
import { env } from '../../config/env';
import { logger } from './logger';
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
      // RELEASE_SCRIPT returns 1 if it deleted the lock (our token still
      // matched), 0 if it didn't (our token was no longer in Redis).
      // 0 means the TTL expired BEFORE fn() finished: another request may
      // have acquired the lock and run concurrently with the tail end of
      // ours — the exact race the lock exists to prevent. This is the
      // only reliable signal that a given TTL is too short for its
      // operation, and previously it was indistinguishable from the
      // normal case. Logged (not thrown — the caller's work is already
      // done, and the result is still what fn() returned), so a
      // production TTL that needs raising actually shows up in the logs
      // instead of silently corrupting a percentage of writes.
      const released = await (redis as any).eval(RELEASE_SCRIPT, 1, key, token);
      if (released === 0) {
        logger.warn(
          'Redis lock expired before its holder finished — TTL is too short for the locked operation',
          { key, ttlSeconds },
        );
      }
    } catch (err) {
      // If release fails (e.g. transient Redis error), the lock still
      // self-heals via its TTL — the caller's work has already finished,
      // so this must not throw. But silent-swallow here would hide a
      // persistent Redis problem that keeps leaking locks until their TTL
      // elapses, so it's logged at warn.
      logger.warn('Redis lock release failed — will self-heal via TTL', {
        key,
        ttlSeconds,
        err,
      });
    }
  }
}

const IMAGE_LOCK_PREFIX = 'ad_images_lock:';
// AUDIT-FIX 1.1: was a hardcoded `30`. Now configurable via
// IMAGE_LOCK_TTL_SECONDS (env.ts), defaulting to the same 30 so
// existing deployments see no behavior change unless they opt in.
const IMAGE_LOCK_TTL_SECONDS = env.ads.imageLockTtlSeconds;

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

// Gap #3 fix: products and service-listings previously had no
// post-creation image add/remove endpoints at all, so no lock was
// needed for them. Now that they mirror ads' addImages/removeImage,
// they need the same concurrency guard ads' own images get via
// withAdImagesLock — reusing the same withRedisLock primitive rather
// than re-implementing SET-NX/Lua-release a third time. Separate
// keyspaces (distinct prefixes) so a product-image lock can never
// contend with an ad-image or listing-image lock.
const PRODUCT_IMAGE_LOCK_PREFIX = 'product_images_lock:';
const LISTING_IMAGE_LOCK_PREFIX = 'listing_images_lock:';
// AUDIT-FIX 1.1: shares the same configurable TTL as IMAGE_LOCK_TTL_SECONDS above.
const ENTITY_IMAGE_LOCK_TTL_SECONDS = IMAGE_LOCK_TTL_SECONDS;

export class EntityImagesLockedError extends AppError {
  constructor(entityId: string) {
    super(`Item ${entityId} is currently being updated by another request — try again shortly`, 409);
  }
}

export async function withProductImagesLock<T>(productId: string, fn: () => Promise<T>): Promise<T> {
  const result = await withRedisLock(
    `${PRODUCT_IMAGE_LOCK_PREFIX}${productId}`,
    ENTITY_IMAGE_LOCK_TTL_SECONDS,
    fn
  );
  if (result === LOCK_NOT_ACQUIRED) {
    throw new EntityImagesLockedError(productId);
  }
  return result;
}

export async function withServiceListingImagesLock<T>(listingId: string, fn: () => Promise<T>): Promise<T> {
  const result = await withRedisLock(
    `${LISTING_IMAGE_LOCK_PREFIX}${listingId}`,
    ENTITY_IMAGE_LOCK_TTL_SECONDS,
    fn
  );
  if (result === LOCK_NOT_ACQUIRED) {
    throw new EntityImagesLockedError(listingId);
  }
  return result;
}

// FIX M-006: products.service.ts's createProduct checked
// storesRepository.countActiveProducts against the free plan's
// 20-product cap, then created the product inside a *separate*
// prisma.$transaction afterwards — with nothing locking the two
// together. Two concurrent createProduct calls for the same
// free-plan store could both read a count under the cap (e.g. both
// see 19) and both proceed to insert, letting the store end up with
// 21+ active products despite the cap — the same class of
// check-then-act race withUserAdCreationLock above already closes
// for per-user ad creation, applied here to per-store product
// creation. Same primitive, its own keyspace so it never contends
// with ad-creation, seller-creation, or store-creation locks.
const STORE_PRODUCT_CREATION_LOCK_PREFIX = 'store_product_creation_lock:';
// Short TTL: only needs to cover the count re-check + DB insert
// (Cloudinary uploads already happen before the lock is taken, same
// ordering rationale as AD_CREATION_LOCK_TTL_SECONDS above).
const STORE_PRODUCT_CREATION_LOCK_TTL_SECONDS = 10;

export class StoreProductCreationLockedError extends AppError {
  constructor() {
    super('Another product creation request is already in progress for this store — please try again in a moment', 409);
  }
}

/**
 * Runs `fn` while holding an exclusive lock on `storeId`'s
 * product-creation slot, serializing the
 * count-active-products-then-create sequence so two concurrent
 * createProduct calls for the same free-plan store can't both pass
 * the FREE_PLAN_PRODUCT_LIMIT check before either has committed its
 * insert. Callers are expected to re-check the count *after*
 * acquiring the lock (the first check, before the lock, is just a
 * fast-path to avoid uploading images for an obviously-over-the-cap
 * request).
 */
export async function withStoreProductCreationLock<T>(storeId: string, fn: () => Promise<T>): Promise<T> {
  const result = await withRedisLock(
    `${STORE_PRODUCT_CREATION_LOCK_PREFIX}${storeId}`,
    STORE_PRODUCT_CREATION_LOCK_TTL_SECONDS,
    fn
  );
  if (result === LOCK_NOT_ACQUIRED) {
    throw new StoreProductCreationLockedError();
  }
  return result;
}

// AUDIT-FIX (race conditions pass): saved-searches.service.ts's
// createSavedSearch checked countByUserId() against
// MAX_SAVED_SEARCHES_PER_USER, then create()'d — with nothing locking
// the two together. Two concurrent createSavedSearch calls for the
// same user could both read a count one under the cap (e.g. both see
// 19) and both proceed to insert, letting the user end up with 21+
// saved searches despite the cap — the exact same class of
// check-then-act race withUserAdCreationLock/withStoreProductCreationLock
// above already close for ad/product creation, applied here to
// per-user saved-search creation. Same primitive, its own keyspace so
// it never contends with any other creation lock.
const SAVED_SEARCH_CREATION_LOCK_PREFIX = 'saved_search_creation_lock:';
// Short TTL: only needs to cover the count re-check + DB insert — no
// slow I/O (no image uploads) happens before this lock is taken, so
// there's nothing to keep the lock held for beyond the query itself.
const SAVED_SEARCH_CREATION_LOCK_TTL_SECONDS = 5;

export class SavedSearchCreationLockedError extends AppError {
  constructor() {
    super('Another saved-search request is already in progress for this account — please try again in a moment', 409);
  }
}

/**
 * Runs `fn` while holding an exclusive lock on `userId`'s
 * saved-search-creation slot, serializing the
 * count-saved-searches-then-create sequence so two concurrent
 * createSavedSearch calls for the same user can't both pass the
 * MAX_SAVED_SEARCHES_PER_USER check before either has committed its
 * insert. Unlike withUserAdCreationLock/withStoreProductCreationLock,
 * there's no unlocked pre-check here — saved-search creation has no
 * slow I/O (no file uploads) to fast-fail before, so a single
 * check-inside-the-lock is enough.
 */
export async function withSavedSearchCreationLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const result = await withRedisLock(
    `${SAVED_SEARCH_CREATION_LOCK_PREFIX}${userId}`,
    SAVED_SEARCH_CREATION_LOCK_TTL_SECONDS,
    fn
  );
  if (result === LOCK_NOT_ACQUIRED) {
    throw new SavedSearchCreationLockedError();
  }
  return result;
}
