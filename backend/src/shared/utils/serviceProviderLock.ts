import { withRedisLock, LOCK_NOT_ACQUIRED } from './adLock';
import { ConflictError } from '../errors/ConflictError';
import { env } from '../../config/env';

const SERVICE_PROVIDER_LOCK_PREFIX = 'service_provider_creation_lock:';
// FIX M-009: was a hardcoded 15s — see env.ts's
// SERVICE_PROVIDER_LOCK_TTL_SECONDS comment / sellerLock.ts's
// identical fix for the full rationale. Now configurable, defaulting
// to 30s.
const SERVICE_PROVIDER_LOCK_TTL_SECONDS = env.locks.serviceProviderLockTtlSeconds;

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
