import { cachePolicy } from '../cache/cachePolicy';
import { getCacheDomain } from '../cache/cacheContract';
import { canonicalCacheKey } from '../cache/cacheKey';
import { bumpGeneration, swrGet, swrGetWithStatus, SwrStatus } from './swrCache';

const PROFILE_CACHE_DOMAIN = getCacheDomain('userProfile');
const PROFILE_CACHE_POLICY = cachePolicy('privateUserProfile').server;

function nextSoftTtlMs(): number {
  const jitter = PROFILE_CACHE_POLICY.softJitterMs;
  const offset = Math.floor(Math.random() * (jitter * 2 + 1)) - jitter;
  return Math.max(1_000, PROFILE_CACHE_POLICY.softTtlMs + offset);
}

function profileCacheKeys(userId: string) {
  const base = canonicalCacheKey(PROFILE_CACHE_DOMAIN.namespace, PROFILE_CACHE_DOMAIN.scope, { userId });
  return {
    key: `${base}:payload`,
    hardGenKey: `${base}:generation`,
  };
}

/**
 * Redis cache for the signed-in user's own low-volatility profile projection.
 * The user ID is part of every key; this cache is never used for anonymous or
 * cross-user responses. SWR's generation token prevents a profile update that
 * races an in-flight DB read from resurrecting the old value.
 */
export async function getCachedUserProfileWithStatus<T>(
  userId: string,
  build: () => Promise<T>
): Promise<{ value: T; status: SwrStatus }> {
  const keys = profileCacheKeys(userId);
  return swrGetWithStatus({
    name: 'users:profile',
    ...keys,
    softTtlMs: nextSoftTtlMs,
    hardTtlSec: PROFILE_CACHE_POLICY.hardTtlSec,
    lockTtlMs: PROFILE_CACHE_POLICY.lockTtlMs,
    build,
  });
}

export async function getCachedUserProfile<T>(
  userId: string,
  build: () => Promise<T>
): Promise<T> {
  return (await getCachedUserProfileWithStatus(userId, build)).value;
}

/**
 * Hard-invalidate just this user's profile. bumpGeneration persists a retry
 * through the existing CACHE_GENERATION_BUMP outbox path if Redis is degraded.
 */
export async function invalidateCachedUserProfile(userId: string): Promise<boolean> {
  const { hardGenKey } = profileCacheKeys(userId);
  return bumpGeneration(hardGenKey, { persistRetry: true });
}

/** Test helper: expose deterministic key parts without exposing mutable state. */
export function getUserProfileCacheKeysForTests(userId: string) {
  return profileCacheKeys(userId);
}
