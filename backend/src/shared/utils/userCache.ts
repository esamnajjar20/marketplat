import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { logger } from './logger';
import type Redis from 'ioredis';

const USER_CACHE_PREFIX = 'user_cache:';
const BASE_TTL = 5 * 60;
const JITTER = 60;
const L1_TTL_MS = 30_000;
// Cross-worker invalidation channel — see the "Cross-worker L1
// invalidation" block below for why this exists and why init is eager.
const INVALIDATION_CHANNEL = 'user_cache:invalidate';
const L1 = new Map<string, { user: CachedUser; exp: number }>();

export const getUserCacheKey = (userId: string): string => `${USER_CACHE_PREFIX}${userId}`;

const inflightMap = new Map<string, Promise<CachedUser | null>>();

// FIX USERCACHE-RACE-01: invalidate() used to be able to run while a
// getOrFetch() DB read was in flight; that read then wrote its (pre-change)
// snapshot into Redis/L1 AFTER the invalidation — re-caching a stale
// isActive/role for up to BASE_TTL (5 min). For a ban that is an auth
// bypass window. Each invalidation now stamps a per-user generation; a
// fetch that started before the stamp changed never writes its result.
// Monotonic global counter + bounded map: eviction only ever makes a
// comparison differ (=> harmless extra refetch), never falsely match.
let genCounter = 0;
const GEN = new Map<string, number>();
const GEN_MAX = 10_000;

function currentGen(userId: string): number {
  return GEN.get(userId) ?? 0;
}

function bumpGen(userId: string): void {
  GEN.delete(userId);
  GEN.set(userId, ++genCounter);
  if (GEN.size > GEN_MAX) {
    const first = GEN.keys().next().value;
    if (first) GEN.delete(first);
  }
}

const getTTLWithJitter = (): number => BASE_TTL + Math.floor(Math.random() * JITTER);

export interface CachedUser {
  id: string;
  role: string;
  isActive: boolean;
  // FIX FEAT-EMAIL-VERIFY: optional so cache entries written
  // before this field existed read as undefined instead of
  // crashing the reader; the gating middleware treats that as
  // "stale, refetch once" so a deploy does not lock everyone out.
  emailVerified?: boolean;
}

function l1Get(userId: string): CachedUser | null {
  const hit = L1.get(userId);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    L1.delete(userId);
    return null;
  }
  // LRU touch: Map preserves insertion order, so re-inserting on read
  // makes the FIFO eviction in l1Set below actually evict the
  // least-recently-USED entry instead of the oldest-INSERTED one. A
  // "hot" user (checked on every request) that happened to be added
  // early previously got evicted before a cold user added after it.
  L1.delete(userId);
  L1.set(userId, hit);
  return hit.user;
}

function l1Set(user: CachedUser): void {
  L1.set(user.id, { user, exp: Date.now() + L1_TTL_MS });
  if (L1.size > 5_000) {
    const first = L1.keys().next().value;
    if (first) L1.delete(first);
  }
}

function l1Del(userId: string): void {
  L1.delete(userId);
}

// ---------------------------------------------------------------------
// Cross-worker L1 invalidation
//
// Under PM2 cluster mode (ecosystem.config.js: exec_mode='cluster',
// instances=2), each worker has its OWN in-process L1 Map. A plain
// userCache.invalidate(userId) on the worker that handled the request
// clears that worker's L1 only — every OTHER worker keeps serving the
// stale user (including a still-true isActive) until L1_TTL_MS elapses.
// For an isActive change (admin ban / self-deactivate) that 30-second
// window is a real auth bypass: auth.middleware.ts trusts
// userCache.peek() before it ever re-reads the DB.
//
// Redis pub/sub closes it: invalidate() publishes the userId, every
// worker's subscriber receives it and drops just that one L1 entry.
// Same redis.duplicate() pattern as notificationStream.ts.
//
// Why EAGER init from server.ts (not lazy-on-first-use like
// notificationStream): a worker that has not yet handled any request
// that touches userCache has not yet put anything in L1 — but a
// worker that HAS, and is not yet subscribed, would miss an
// invalidation published while the admin's request went to another
// worker. Subscribing at boot on every worker closes that window
// unconditionally.
// ---------------------------------------------------------------------

let subscriber: Redis | null = null;
let subscriberReady: Promise<void> | null = null;

/**
 * Eagerly subscribes this worker to the cross-worker invalidation
 * channel. Must be called at boot on every worker BEFORE the first
 * request is served (server.ts bootstrap). Idempotent: a second call
 * is a no-op. Never throws — a Redis failure here must not prevent
 * the server from starting; the 30s L1 TTL bounds eventual staleness.
 */
export function initUserCacheInvalidationSubscriber(): void {
  if (subscriberReady) return;
  subscriberReady = (async () => {
    try {
      subscriber = redis.duplicate();
      subscriber.on('error', (err) => {
        logger.warn('userCache invalidation subscriber error', { err });
      });
      if (subscriber.status === 'wait') {
        await subscriber.connect();
      }
      await subscriber.subscribe(INVALIDATION_CHANNEL);
      subscriber.on('message', (channel, message) => {
        if (channel !== INVALIDATION_CHANNEL) return;
        if (message) {
          l1Del(message);
          // Invalidation may have been issued by ANOTHER worker: any fetch
          // in flight on this worker started before it and is now stale.
          bumpGen(message);
          inflightMap.delete(message);
        }
      });
      logger.info('userCache invalidation subscriber ready');
    } catch (err) {
      logger.warn(
        'userCache invalidation subscriber unavailable — L1 will only be cleared on the worker handling the invalidation',
        { err },
      );
      subscriber = null;
    }
  })();
}

/** Called from server.ts's graceful-shutdown / uncaughtException cleanup. */
export function stopUserCacheInvalidationSubscriber(): void {
  const s = subscriber;
  subscriber = null;
  subscriberReady = null;
  if (s) {
    try {
      void s.quit();
    } catch {
      /* ignore */
    }
  }
}

export const userCache = {
  peek: (userId: string): CachedUser | null => l1Get(userId),

  get: async (userId: string): Promise<CachedUser | null> => {
    const local = l1Get(userId);
    if (local) return local;
    try {
      const cached = await redis.get(getUserCacheKey(userId));
      if (!cached) return null;
      const user = JSON.parse(cached) as CachedUser;
      l1Set(user);
      return user;
    } catch (err) {
      // Redis is a cache, not the source of truth — a miss here falls
      // through to getOrFetch's DB read. Logged (not silent) so a
      // persistent Redis outage is visible; on a healthy cache this
      // line never fires.
      logger.warn('userCache.get failed', { userId, err });
      return null;
    }
  },

  set: async (user: CachedUser): Promise<void> => {
    l1Set(user);
    try {
      await redis.setex(getUserCacheKey(user.id), getTTLWithJitter(), JSON.stringify(user));
    } catch (err) {
      logger.warn('userCache.set failed', { userId: user.id, err });
    }
  },

  invalidate: async (userId: string): Promise<void> => {
    bumpGen(userId);
    inflightMap.delete(userId); // new callers must not join a stale fetch
    l1Del(userId);
    try {
      await redis.del(getUserCacheKey(userId));
      // Fan out to the OTHER workers so their L1 entries drop too.
      // Subscribers run l1Del only — the Redis key is already gone.
      await redis.publish(INVALIDATION_CHANNEL, userId);
    } catch (err) {
      // Covers both del and publish. If either fails, other workers'
      // L1 entries stay stale up to L1_TTL_MS — logging (replacing the
      // previous silent catch) makes that window visible in the logs.
      logger.warn('userCache.invalidate failed', { userId, err });
    }
  },

  getOrFetch: async (userId: string): Promise<CachedUser | null> => {
    const cached = await userCache.get(userId);
    if (cached) return cached;

    const existing = inflightMap.get(userId);
    if (existing) return existing;

    let fetchPromise: Promise<CachedUser | null> | undefined;
    fetchPromise = (async () => {
      // Yield once so `fetchPromise` is assigned and registered in
      // inflightMap before any code path (incl. a synchronous throw)
      // reaches the finally block below.
      await Promise.resolve();
      try {
        // At most one re-read if an invalidation lands mid-flight.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const genBefore = currentGen(userId);
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true, isActive: true, emailVerified: true },
          });
          if (!user) return null;

          const cachedUser: CachedUser = {
            id: user.id,
            role: user.role as string,
            isActive: user.isActive,
            emailVerified: user.emailVerified,
          };

          if (currentGen(userId) === genBefore) {
            await userCache.set(cachedUser);
            return cachedUser;
          }
          // Invalidated while reading: the snapshot may predate the change.
          if (attempt === 1) return cachedUser; // serve, but do NOT cache
        }
        return null;
      } catch (err) {
        logger.error('Failed to fetch user for cache', { userId, err });
        return null;
      } finally {
        // Only remove our own entry — invalidate() may have replaced it.
        if (inflightMap.get(userId) === fetchPromise) inflightMap.delete(userId);
      }
    })();

    inflightMap.set(userId, fetchPromise);
    return fetchPromise;
  },
};
