import { withRedisLock, LOCK_NOT_ACQUIRED } from './adLock';
import { ConflictError } from '../errors/ConflictError';

const OAUTH_LOCK_PREFIX = 'oauth_account_resolution_lock:';
const OAUTH_LOCK_TTL_SECONDS = 15;

/**
 * FIX OAUTH-01: serializes authService.loginWithGoogle()'s
 * check-then-create/link sequence per email, so two concurrent Google
 * callbacks for the same email (e.g. a double-click on "Continue with
 * Google", or two tabs) can't both pass the "no existing account"
 * check before either has committed its insert — which would either
 * throw an unhandled P2002 on the second create() or, worse, produce
 * two different sessions racing to decide the account's real identity.
 * Same mechanism as withSellerProfileCreationLock (sellerLock.ts) and
 * withUserAdCreationLock (adLock.ts), in its own keyspace so it never
 * contends with either. Keyed by email (not googleId) because the
 * critical race is specifically "does a User with this email already
 * exist" — the same question loginWithGoogle's own logic asks.
 */
export async function withOAuthAccountResolutionLock<T>(
  email: string,
  fn: () => Promise<T>
): Promise<T> {
  const key = `${OAUTH_LOCK_PREFIX}${email.toLowerCase()}`;
  const result = await withRedisLock(key, OAUTH_LOCK_TTL_SECONDS, fn);
  if (result === LOCK_NOT_ACQUIRED) {
    throw new ConflictError(
      'A sign-in is already in progress for this account. Please wait a moment and try again.',
      'OAUTH_RESOLUTION_IN_PROGRESS'
    );
  }
  return result as T;
}
