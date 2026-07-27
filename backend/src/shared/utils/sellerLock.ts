import { withRedisLock, LOCK_NOT_ACQUIRED } from './adLock';
import { ConflictError } from '../errors/ConflictError';

const SELLER_LOCK_PREFIX = 'seller_profile_creation_lock:';
const SELLER_LOCK_TTL_SECONDS = 15;

/**
 * Serializes the check-then-create sequence in
 * sellersService.createSellerProfile so two concurrent requests from the
 * same user can't both pass the "no existing profile" check before
 * either has committed its insert. Same mechanism as
 * withUserAdCreationLock/withAdImagesLock in adLock.ts, in its own
 * keyspace so it never contends with ad-creation or ad-image locks.
 */
export async function withSellerProfileCreationLock<T>(
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = `${SELLER_LOCK_PREFIX}${userId}`;
  const result = await withRedisLock(key, SELLER_LOCK_TTL_SECONDS, fn);
  if (result === LOCK_NOT_ACQUIRED) {
    throw new ConflictError('Your seller profile is already being created. Please wait a moment.');
  }
  return result as T;
}
