import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { logger } from '../shared/utils/logger';
import { env } from './env';

const commonOptions: RedisOptions = {
  // Render's egress path is IPv4-only in the deployment region; forcing IPv4
  // avoids a silent IPv6 timeout before every successful connection.
  family: 4,
  keepAlive: 10_000,
  enableReadyCheck: false,
  lazyConnect: true,
  connectTimeout: 10_000,
  retryStrategy: times => Math.min(times * 50, 2_000),
  maxRetriesPerRequest: 3,
};

function createPrimaryClient(): Redis {
  return new Redis({
    ...commonOptions,
    host: env.redis.host,
    port: env.redis.port,
    username: env.redis.username,
    password: env.redis.password,
    tls: env.redis.tls ? {} : undefined,
  });
}

/** Existing primary connection — kept as a compatibility alias for legacy,
 * operational and transactional Redis keys until each call site is assigned
 * to a logical service. */
export const redis = createPrimaryClient();
redis.on('connect', () => logger.info('✅ Redis connected'));
redis.on('error', err => logger.error('Redis error', { err: err.message }));

// Multiple logical services may intentionally share one endpoint. Reuse one
// ioredis client per exact URL rather than multiplying TCP connections when
// two service variables point to the same provider/database.
const serviceClientsByUrl = new Map<string, Redis>();
function createServiceClient(
  url: string | undefined,
  serviceName: string,
  maxRetriesPerRequest = 3
): Redis {
  if (!url) return redis;
  const normalizedUrl = url.trim();
  const clientKey = `${maxRetriesPerRequest}:${normalizedUrl}`;
  const existing = serviceClientsByUrl.get(clientKey);
  if (existing) return existing;

  const client = new Redis(normalizedUrl, { ...commonOptions, maxRetriesPerRequest });
  client.on('connect', () => logger.info(`✅ Redis (${serviceName}) connected`));
  client.on('error', err => logger.error(`Redis (${serviceName}) error`, { err: err.message }));
  serviceClientsByUrl.set(clientKey, client);
  return client;
}

/**
 * Logical service clients. Each may use an independent provider via a
 * redis:// or rediss:// endpoint; unset variables intentionally fall back to
 * the existing primary Redis instance. No random writes, cross-provider
 * sharding or automatic state migration occur here.
 */
export const sessionRedis = createServiceClient(env.redisServices.sessionsUrl, 'sessions');
export const rateLimitRedis = createServiceClient(env.redisServices.rateLimitUrl, 'rate-limit');
export const pubSubRedis = createServiceClient(env.redisServices.pubSubUrl, 'pubsub');
export const queueRedis = createServiceClient(env.redisServices.queueUrl, 'queue');
export const presenceRedis = createServiceClient(env.redisServices.presenceUrl, 'presence');
// Shared with Go Worker: Express writes activity/views buffers and Go drains them.
export const bufferRedis = createServiceClient(env.redisServices.bufferUrl, 'buffer');

// Dependencies whose loss makes authentication/security or buffered-write
// handling unsafe. Cache, presence, pub/sub and queue services are optional:
// their callers have reconstructible-cache or inline/degraded fallbacks.
export const criticalRedisServiceClients: Redis[] = [
  ...new Set([redis, sessionRedis, rateLimitRedis, bufferRedis]),
];

/**
 * Disposable cache service. Prefer the URL form; the original host/port
 * settings remain supported for backward compatibility with existing Render
 * and Docker deployments. Cache data is reconstructible, so an evicting
 * maxmemory policy is appropriate here, never for sessions/limits/queues.
 */
const cacheRedisFromHost: Redis | null = !env.redisServices.cacheUrl && env.redisCache
  ? new Redis({
      ...commonOptions,
      host: env.redisCache.host,
      port: env.redisCache.port,
      username: env.redisCache.username,
      password: env.redisCache.password,
      tls: env.redisCache.tls ? {} : undefined,
      maxRetriesPerRequest: 1,
    })
  : null;

export const cacheRedis: Redis = env.redisServices.cacheUrl
  ? createServiceClient(env.redisServices.cacheUrl, 'cache', 1)
  : cacheRedisFromHost ?? redis;

if (cacheRedisFromHost) {
  cacheRedisFromHost.on('connect', () => logger.info('✅ Redis (cache) connected'));
  cacheRedisFromHost.on('error', err => logger.error('Redis (cache) error', { err: err.message }));
}

/** BullMQ owns dedicated producer/worker sockets and retry semantics. They
 * always use the queue service endpoint when configured, otherwise primary.
 * BullMQ workers require maxRetriesPerRequest=null; producers fail quickly. */
export function createBullMqConnection(role: 'producer' | 'worker'): Redis {
  const options: RedisOptions = {
    ...commonOptions,
    maxRetriesPerRequest: role === 'worker' ? null : 1,
    // BullMQ owns its connection lifecycle and expects an eager connection.
    lazyConnect: false,
    // BullMQ requires ready checks for version/policy warnings.
    enableReadyCheck: true,
  };
  const conn = env.redisServices.queueUrl
    ? new Redis(env.redisServices.queueUrl, options)
    : new Redis({
        ...options,
        host: env.redis.host,
        port: env.redis.port,
        username: env.redis.username,
        password: env.redis.password,
        tls: env.redis.tls ? {} : undefined,
      });
  conn.on('error', err => logger.error(`BullMQ ${role} Redis error`, { err: err.message }));
  return conn;
}

export type RedisLogicalServiceKey =
  | 'core'
  | 'cache'
  | 'sessions'
  | 'rateLimit'
  | 'pubSub'
  | 'queue'
  | 'presence'
  | 'buffer';

export interface RedisLogicalServiceHealth {
  key: RedisLogicalServiceKey;
  label: string;
  dedicated: boolean;
  sharedWith: RedisLogicalServiceKey | null;
  ok: boolean;
  latencyMs: number | null;
}

const logicalServices: Array<{
  key: RedisLogicalServiceKey;
  label: string;
  client: Redis;
  dedicated: boolean;
}> = [
  { key: 'core', label: 'Redis الأساسي', client: redis, dedicated: false },
  { key: 'cache', label: 'الكاش', client: cacheRedis, dedicated: cacheRedis !== redis },
  { key: 'sessions', label: 'الجلسات والرموز', client: sessionRedis, dedicated: sessionRedis !== redis },
  { key: 'rateLimit', label: 'تحديد المعدل', client: rateLimitRedis, dedicated: rateLimitRedis !== redis },
  { key: 'pubSub', label: 'Pub/Sub والإشعارات', client: pubSubRedis, dedicated: pubSubRedis !== redis },
  { key: 'queue', label: 'الطوابير', client: queueRedis, dedicated: queueRedis !== redis },
  { key: 'presence', label: 'الحضور', client: presenceRedis, dedicated: presenceRedis !== redis },
  { key: 'buffer', label: 'مخازن Go / Activity / Views', client: bufferRedis, dedicated: bufferRedis !== redis },
];

/**
 * Manual diagnostics used by the protected admin health page. Identical
 * clients are pinged once and shared status is reflected in each logical row.
 * There is no timer, warmup, scheduled probe or background health loop.
 */
export async function inspectRedisLogicalServices(): Promise<RedisLogicalServiceHealth[]> {
  const clientResults = new Map<Redis, Promise<{ ok: boolean; latencyMs: number | null }>>();
  const inspect = (client: Redis) => {
    let pending = clientResults.get(client);
    if (!pending) {
      pending = (async () => {
        const startedAt = Date.now();
        let timeout: NodeJS.Timeout | undefined;
        try {
          await Promise.race([
            client.ping(),
            new Promise<never>((_, reject) => {
              timeout = setTimeout(() => reject(new Error('Redis health probe timed out')), 1_800);
              timeout.unref?.();
            }),
          ]);
          return { ok: true, latencyMs: Date.now() - startedAt };
        } catch {
          return { ok: false, latencyMs: null };
        } finally {
          if (timeout) clearTimeout(timeout);
        }
      })();
      clientResults.set(client, pending);
    }
    return pending;
  };

  const firstKeyByClient = new Map<Redis, RedisLogicalServiceKey>();
  for (const service of logicalServices) {
    if (!firstKeyByClient.has(service.client)) firstKeyByClient.set(service.client, service.key);
  }

  return Promise.all(
    logicalServices.map(async service => {
      const result = await inspect(service.client);
      const firstKey = firstKeyByClient.get(service.client) ?? null;
      return {
        key: service.key,
        label: service.label,
        dedicated: service.dedicated,
        sharedWith: firstKey !== service.key ? firstKey : null,
        ...result,
      };
    })
  );
}

/** Close only the long-lived logical service clients; BullMQ's own producer
 * and worker connections are closed by stopNotificationQueue(). */
export async function closeRedisServiceClients(): Promise<void> {
  const clients = new Set<Redis>([
    redis,
    cacheRedis,
    sessionRedis,
    rateLimitRedis,
    pubSubRedis,
    queueRedis,
    presenceRedis,
    bufferRedis,
  ]);
  await Promise.allSettled([...clients].map(client => client.quit()));
}
