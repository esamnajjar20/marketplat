import Redis from 'ioredis';
import { logger } from '../shared/utils/logger';
import { env } from './env';

export const redis = new Redis({
  host: env.redis.host,
  port: env.redis.port,
  username: env.redis.username || undefined,
  password: env.redis.password || undefined,
  // family=4 forces IPv4, avoiding the ~100ms
  // IPv6-then-fallback-to-IPv4 delay Node.js incurs when the host
  // has an AAAA record but the network path for IPv6 is unavailable
  // (Aiven publishes both A and AAAA; Render's egress path is IPv4-only
  // in our region, so every fresh connect was silently paying the
  // 100ms IPv6 timeout before falling back).
  family: 4,
  // keepAlive sends TCP keepalive probes every 10s so idle connections
  // are not dropped by the Aiven haproxy front (which closes idle
  // connections after ~60s), preventing a fresh TLS handshake (~50-80ms)
  // on the next PING after a quiet period.
  keepAlive: 10_000,
  // enableReadyCheck=false skips the extra INFO command ioredis sends
  // after connecting to verify the server is ready; for a health-check
  // PING path this removes one additional round-trip per connection.
  enableReadyCheck: false,
  lazyConnect: true,
  // previously no connectTimeout was set, so an
  // unreachable host (e.g. REDIS_HOST misconfigured/pointing at a
  // service that doesn't exist on the network) left the underlying TCP
  // connect() attempt hanging indefinitely — ioredis only starts its
  // retryStrategy backoff *after* an attempt actually fails, so with no
  // timeout an attempt that never resolves means retryStrategy never
  // even runs. server.ts's own withRetry() wraps redis.ping() expecting
  // a rejected promise to retry against, but with the connect itself
  // stuck, that await never settles either way — no warning is logged,
  // no error is thrown, and the process just hangs before ever reaching
  // app.listen(), which is invisible to PM2 (the process is alive, just
  // stuck) and shows up externally as a platform-level "connection
  // refused" with no clear cause in the app's own logs. 10s bounds a
  // single connection attempt so a real failure surfaces quickly and
  // predictably instead of hanging.
  connectTimeout: 10_000,
  // + TLS is now conditional on
  // REDIS_TLS (env.ts, default false) instead of hardcoded on. Upstash
  // (and most managed Redis providers) require TLS on every plan — the
  // `rediss://` scheme / "TLS/SSL: Enabled" in Upstash's dashboard is
  // not optional, and ioredis does not infer TLS from a host/port pair;
  // without an explicit `tls` option against a provider like that it
  // opens a plain TCP socket and attempts a plaintext Redis handshake
  // against a server expecting a TLS handshake. That mismatch is what
  // produced the repeating "Redis connected" -> immediate "read
  // ECONNRESET" cycle seen in production: some connection attempts
  // partially complete before the server rejects the plaintext
  // protocol, which looks like intermittent flakiness but is actually a
  // deterministic protocol mismatch on every single connection attempt.
  //
  // But the previous unconditional `tls: {}` broke the opposite case
  // just as badly: a local/self-hosted Redis (docker-compose, or a
  // native install under Termux/proot-distro — see REDIS_HOST's own
  // "TERMUX/PROOT SUPPORT" comment in env.ts) speaks plain TCP, not
  // TLS. An ioredis client forcing a TLS handshake against a plaintext
  // server just hangs until connectTimeout fires, surfacing as an
  // opaque `connect ETIMEDOUT` with nothing in the error pointing at
  // TLS as the actual cause. env.redis.tls ? {} is the same "enable TLS
  // using Node's default secure context" value as before (correct for
  // Upstash's publicly-trusted certificate, no custom CA needed), now
  // applied only when REDIS_TLS=true is actually set.
  tls: env.redis.tls ? {} : undefined,
  retryStrategy: times => Math.min(times * 50, 2000),
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => logger.info('✅ Redis connected'));
redis.on('error', err => logger.error('Redis error', { err: err.message }));

/**
 * client for the disposable public caches.
 *
 * The primary instance runs `noeviction` on purpose (sessions and
 * rate-limit counters must never be silently evicted). The price is that once
 * it is full EVERY write fails — including the generation-token overwrite that
 * makes a takedown ("hard" invalidation) effective. Pointing the SWR caches at
 * a separate LRU instance removes that coupling: a full cache evicts old
 * entries instead of rejecting invalidations. Eviction is safe here — generation
 * tokens are random, so an evicted token just makes older envelopes unreadable.
 *
 * Without REDIS_CACHE_HOST this IS the primary client (no behaviour change).
 */
export const cacheRedis: Redis = env.redisCache
  ? new Redis({
      host: env.redisCache.host,
      port: env.redisCache.port,
      username: env.redisCache.username,
      password: env.redisCache.password,
      family: 4,
      keepAlive: 10_000,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 10_000,
      tls: env.redisCache.tls ? {} : undefined,
      retryStrategy: times => Math.min(times * 50, 2000),
      // Cache calls are already bounded by cacheGuard (300ms + breaker).
      maxRetriesPerRequest: 1,
    })
  : redis;

if (cacheRedis !== redis) {
  cacheRedis.on('connect', () => logger.info('✅ Redis (cache) connected'));
  cacheRedis.on('error', err => logger.error('Redis (cache) error', { err: err.message }));
}

/**
 * dedicated connection factory for BullMQ.
 *
 * BullMQ must not share the app's `redis` client:
 *  - Workers use blocking commands and require `maxRetriesPerRequest: null`,
 *    while the shared client keeps 3 so ordinary requests fail fast.
 *  - Producers (Queue) want the opposite — fail fast when Redis is down so
 *    notifyUser can fall back to inline delivery instead of hanging a request.
 *
 * Always the PRIMARY instance (noeviction): a queue on an evicting cache
 * would silently lose jobs. Not lazyConnect — BullMQ manages readiness itself.
 */
export function createBullMqConnection(role: 'producer' | 'worker'): Redis {
  const conn = new Redis({
    host: env.redis.host,
    port: env.redis.port,
    username: env.redis.username || undefined,
    password: env.redis.password || undefined,
    family: 4,
    keepAlive: 10_000,
    connectTimeout: 10_000,
    tls: env.redis.tls ? {} : undefined,
    retryStrategy: times => Math.min(times * 50, 2000),
    maxRetriesPerRequest: role === 'worker' ? null : 1,
    // BullMQ requires the ready check for its version/policy warnings.
    enableReadyCheck: true,
  });
  conn.on('error', err => logger.error(`BullMQ ${role} Redis error`, { err: err.message }));
  return conn;
}
