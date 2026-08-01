import { withRedisLock, LOCK_NOT_ACQUIRED } from './adLock';
import { ConflictError } from '../errors/ConflictError';

const STORE_LOCK_PREFIX = 'store_creation_lock:';
const STORE_LOCK_TTL_SECONDS = 15;

/**
 * Serializes the check-then-create sequence in
 * storesService.createStore so two concurrent requests from the same
 * seller profile can't both pass the "no existing store" check before
 * either has committed its insert. Same mechanism as
 * withServiceProviderCreationLock, in its own keyspace so it never
 * contends with seller-profile / service-provider / ad-creation locks.
 */
export async function withStoreCreationLock<T>(
  sellerProfileId: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = `${STORE_LOCK_PREFIX}${sellerProfileId}`;
  const result = await withRedisLock(key, STORE_LOCK_TTL_SECONDS, fn);
  if (result === LOCK_NOT_ACQUIRED) {
    throw new ConflictError('Your store is already being created. Please wait a moment.');
  }
  return result as T;
}
