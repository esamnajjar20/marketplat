import { randomUUID } from 'crypto';
import type Redis from 'ioredis';

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('PEXPIRE', KEYS[1], ARGV[2])
end
return 0
`;

/**
 * Runs a periodic task on at most one API process across all replicas.
 * The lease is renewed while work is in progress and released only by its
 * owner. PostgreSQL advisory locks remain the final correctness guard inside
 * the job handlers; this lease prevents redundant HTTP calls to Go in the
 * normal case and recovers automatically after a crashed process.
 *
 * Fail closed when Redis is unavailable: do not fan out duplicate work.
 * Buffered data remains in Redis and a later tick can retry.
 */
export async function withDistributedLease<T>(
  redis: Redis,
  key: string,
  task: () => Promise<T>,
  options: { ttlMs?: number; renewEveryMs?: number } = {}
): Promise<{ acquired: false } | { acquired: true; value: T }> {
  const ttlMs = Math.max(5_000, options.ttlMs ?? 15_000);
  const renewEveryMs = Math.max(1_000, Math.min(options.renewEveryMs ?? 5_000, ttlMs / 2));
  const token = randomUUID();
  const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');
  if (acquired !== 'OK') return { acquired: false };

  const renewTimer = setInterval(() => {
    void redis.eval(RENEW_SCRIPT, 1, key, token, String(ttlMs)).catch(() => undefined);
  }, renewEveryMs);
  renewTimer.unref();

  try {
    return { acquired: true, value: await task() };
  } finally {
    clearInterval(renewTimer);
    await redis.eval(RELEASE_SCRIPT, 1, key, token).catch(() => undefined);
  }
}
