import { CircuitBreaker } from './circuitBreaker';

/**
 * bound how long a *cache* Redis call may take.
 *
 * Why this exists: config/redis.ts has no `commandTimeout`, and ioredis keeps
 * commands in its offline queue while the connection is down/reconnecting, so
 * a slow or unreachable Redis makes every `redis.get()` in a cache-aside path
 * wait (up to seconds) before the "fall back to the DB" catch block ever runs.
 * `/ads` does two sequential reads per request (version, then value), so the
 * delay doubles.
 *
 * Why it is NOT a global `commandTimeout` on the shared client: the same
 * client also serves auth (token blacklist / refresh lock), rate limiting,
 * Lua scripts (`eval`) and SCAN-based flushes. A short global timeout would
 * turn a merely-slow-but-healthy Redis into spurious auth/rate-limit
 * failures. Only best-effort *cache* reads/writes should fail fast, so the
 * guard is opt-in and applied at those call sites only.
 *
 * Two layers:
 *  - `withCacheTimeout`  — per-call deadline (no state). Use for writes that
 *    must still be attempted when the breaker is open (e.g. cache
 *    invalidation), so a skipped invalidation can never leave stale entries.
 *  - `guardedCache`      — deadline + circuit breaker. After a few consecutive
 *    failures the cache is skipped entirely for a short cooldown, so requests
 *    go straight to the DB instead of each paying the timeout.
 *
 * Callers already wrap cache access in try/catch and fall back to the DB, so
 * both helpers simply throw on timeout / open circuit.
 */
export const CACHE_COMMAND_TIMEOUT_MS = 300;

export class CacheTimeoutError extends Error {
  constructor(ms: number) {
    super(`Redis cache command timed out after ${ms}ms`);
    this.name = 'CacheTimeoutError';
  }
}

export function withCacheTimeout<T>(
  op: () => Promise<T>,
  timeoutMs: number = CACHE_COMMAND_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CacheTimeoutError(timeoutMs)), timeoutMs);
    let promise: Promise<T>;
    try {
      promise = op();
    } catch (err) {
      clearTimeout(timer);
      reject(err);
      return;
    }
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      err => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

const cacheBreaker = new CircuitBreaker({
  name: 'redis-cache',
  failureThreshold: 3,
  resetTimeoutMs: 10_000,
});

export function guardedCache<T>(op: () => Promise<T>): Promise<T> {
  return cacheBreaker.execute(() => withCacheTimeout(op));
}

/** Test escape hatch: closes the breaker so one test's failures don't leak into the next. */
export function resetCacheGuard(): void {
  cacheBreaker.reset();
}
