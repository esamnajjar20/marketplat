import { withRedisLock, LOCK_NOT_ACQUIRED } from './adLock';
import { ConflictError } from '../errors/ConflictError';

const PROVIDER_SCHEDULE_LOCK_PREFIX = 'provider_schedule_lock:';
const PROVIDER_SCHEDULE_LOCK_TTL_SECONDS = 10;

/**
 * services-design.md §8: serializes the
 * check-overlap-then-create-appointment sequence per provider, so two
 * concurrent booking requests for the same provider can't both pass the
 * overlap check before either has committed its insert. Same mechanism
 * as withUserAdCreationLock/withSellerProfileCreationLock, in its own
 * keyspace so it never contends with either.
 */
export async function withProviderScheduleLock<T>(
  providerId: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = `${PROVIDER_SCHEDULE_LOCK_PREFIX}${providerId}`;
  const result = await withRedisLock(key, PROVIDER_SCHEDULE_LOCK_TTL_SECONDS, fn);
  if (result === LOCK_NOT_ACQUIRED) {
    throw new ConflictError('This provider\u2019s schedule is being updated — please try again shortly.');
  }
  return result as T;
}
