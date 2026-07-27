import { withRedisLock, LOCK_NOT_ACQUIRED } from './adLock';
import { ConflictError } from '../errors/ConflictError';

const SERVICE_PROVIDER_LOCK_PREFIX = 'service_provider_creation_lock:';
const SERVICE_PROVIDER_LOCK_TTL_SECONDS = 15;

/**
 * Serializes the check-then-create sequence in
 * serviceProvidersService.createServiceProvider so two concurrent
 * requests from the same seller profile can't both pass the "no existing
 * service provider details" check before either has committed its insert.
 * Same mechanism as withSellerProfileCreationLock, in its own keyspace so
 * it never contends with seller-profile or ad-creation locks.
 */
export async function withServiceProviderCreationLock<T>(
  sellerProfileId: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = `${SERVICE_PROVIDER_LOCK_PREFIX}${sellerProfileId}`;
  const result = await withRedisLock(key, SERVICE_PROVIDER_LOCK_TTL_SECONDS, fn);
  if (result === LOCK_NOT_ACQUIRED) {
    throw new ConflictError(
      'Your service provider profile is already being created. Please wait a moment.'
    );
  }
  return result as T;
}
