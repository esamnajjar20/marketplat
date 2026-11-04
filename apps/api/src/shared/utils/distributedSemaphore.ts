import { randomUUID } from 'node:crypto';
import { redis } from '../../config/redis';
import { logger } from './logger';

/**
 * One Redis-backed semaphore shared by every API process/replica.
 * Keep capacity and key version identical across the deployment. The lease
 * recovers slots after process crashes; heartbeat extends long-running uploads.
 */
export const MEDIA_UPLOAD_GLOBAL_CONCURRENCY = 3;
const MEDIA_UPLOAD_SEMAPHORE_KEY = 'marketplat:media-upload-semaphore:v1';
const LEASE_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

const ACQUIRE_SCRIPT = `
  local key = KEYS[1]
  local token = ARGV[1]
  local now = tonumber(ARGV[2])
  local leaseMs = tonumber(ARGV[3])
  local capacity = tonumber(ARGV[4])
  redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
  if redis.call('ZCARD', key) >= capacity then return 0 end
  redis.call('ZADD', key, now + leaseMs, token)
  return 1
`;

const EXTEND_SCRIPT = `
  local key = KEYS[1]
  local token = ARGV[1]
  local now = tonumber(ARGV[2])
  local leaseMs = tonumber(ARGV[3])
  if redis.call('ZSCORE', key, token) == false then return 0 end
  redis.call('ZADD', key, 'XX', now + leaseMs, token)
  return 1
`;

const RELEASE_SCRIPT = `return redis.call('ZREM', KEYS[1], ARGV[1])`;

export interface DistributedSemaphoreLease {
  release(): Promise<void>;
}

/**
 * Returns null when the global capacity is full. Redis errors are propagated:
 * uploads fail closed rather than silently reverting to per-process limits.
 */
export async function acquireMediaUploadLease(): Promise<DistributedSemaphoreLease | null> {
  const token = randomUUID();
  const acquired = Number(await redis.eval(
    ACQUIRE_SCRIPT,
    1,
    MEDIA_UPLOAD_SEMAPHORE_KEY,
    token,
    Date.now(),
    LEASE_MS,
    MEDIA_UPLOAD_GLOBAL_CONCURRENCY,
  ));

  if (acquired !== 1) return null;

  let released = false;
  const heartbeat = setInterval(() => {
    void redis.eval(
      EXTEND_SCRIPT,
      1,
      MEDIA_UPLOAD_SEMAPHORE_KEY,
      token,
      Date.now(),
      LEASE_MS,
    ).then(result => {
      if (Number(result) !== 1) {
        logger.error('Distributed media upload lease was lost', { token });
      }
    }).catch(error => {
      logger.error('Could not renew distributed media upload lease', {
        error: error instanceof Error ? error.message : 'unknown Redis error',
      });
    });
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    async release(): Promise<void> {
      if (released) return;
      released = true;
      clearInterval(heartbeat);
      await redis.eval(RELEASE_SCRIPT, 1, MEDIA_UPLOAD_SEMAPHORE_KEY, token);
    },
  };
}
