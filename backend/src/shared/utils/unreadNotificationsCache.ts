import { redis } from '../../config/redis';
import { logger } from './logger';
import type Redis from 'ioredis';

const UNREAD_COUNT_CACHE_PREFIX = 'unread_notifications_count:';
const BASE_TTL = 45;
const JITTER = 15;
const L1_TTL_MS = 12_000;
// Cross-worker invalidation channel — same PM2-cluster reasoning as
// userCache.ts's own "Cross-worker L1 invalidation" block, though the
// impact here is a stale badge count (≤12s), not an auth bypass.
const INVALIDATION_CHANNEL = 'unread_notifications_count:invalidate';
const L1 = new Map<string, { count: number; exp: number }>();

export const getUnreadNotificationsCacheKey = (userId: string): string =>
  `${UNREAD_COUNT_CACHE_PREFIX}${userId}`;

const getTTLWithJitter = (): number => BASE_TTL + Math.floor(Math.random() * JITTER);

function l1Get(userId: string): number | null {
  const hit = L1.get(userId);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    L1.delete(userId);
    return null;
  }
  // LRU touch — see userCache.ts's identical l1Get for why
  // re-inserting on read matters for the FIFO bound in l1Set below.
  L1.delete(userId);
  L1.set(userId, hit);
  return hit.count;
}

function l1Set(userId: string, count: number): void {
  L1.set(userId, { count, exp: Date.now() + L1_TTL_MS });
  if (L1.size > 5_000) {
    const first = L1.keys().next().value;
    if (first) L1.delete(first);
  }
}

function l1Del(userId: string): void {
  L1.delete(userId);
}

// ---------------------------------------------------------------------
// Cross-worker L1 invalidation (see userCache.ts for the full block).
// Same redis.duplicate() + subscribe + l1Del-on-message pattern. Eager
// init from server.ts bootstrap on every worker so no invalidation is
// missed while a worker is still warming up.
// ---------------------------------------------------------------------

let subscriber: Redis | null = null;
let subscriberReady: Promise<void> | null = null;

export function initUnreadNotificationsCacheInvalidationSubscriber(): void {
  if (subscriberReady) return;
  subscriberReady = (async () => {
    try {
      subscriber = redis.duplicate();
      subscriber.on('error', (err) => {
        logger.warn('unreadNotificationsCache invalidation subscriber error', { err });
      });
      if (subscriber.status === 'wait') {
        await subscriber.connect();
      }
      await subscriber.subscribe(INVALIDATION_CHANNEL);
      subscriber.on('message', (channel, message) => {
        if (channel !== INVALIDATION_CHANNEL) return;
        if (message) l1Del(message);
      });
      logger.info('unreadNotificationsCache invalidation subscriber ready');
    } catch (err) {
      logger.warn(
        'unreadNotificationsCache invalidation subscriber unavailable — L1 will only be cleared on the worker handling the invalidation',
        { err },
      );
      subscriber = null;
    }
  })();
}

export function stopUnreadNotificationsCacheInvalidationSubscriber(): void {
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

export const unreadNotificationsCache = {
  get: async (userId: string): Promise<number | null> => {
    const local = l1Get(userId);
    if (local !== null) return local;

    try {
      const cached = await redis.get(getUnreadNotificationsCacheKey(userId));
      if (cached === null) return null;
      const parsed = Number(cached);
      if (!Number.isFinite(parsed)) return null;
      l1Set(userId, parsed);
      return parsed;
    } catch (err) {
      // Cache miss falls through to the DB count — logged (not silent)
      // so a persistent Redis outage is visible.
      logger.warn('unreadNotificationsCache.get failed', { userId, err });
      return null;
    }
  },

  set: async (userId: string, count: number): Promise<void> => {
    l1Set(userId, count);
    try {
      await redis.setex(getUnreadNotificationsCacheKey(userId), getTTLWithJitter(), String(count));
    } catch (err) {
      logger.warn('unreadNotificationsCache.set failed', { userId, err });
    }
  },

  invalidate: async (userId: string): Promise<void> => {
    l1Del(userId);
    try {
      await redis.del(getUnreadNotificationsCacheKey(userId));
      // Fan out so OTHER workers drop their L1 entry immediately
      // instead of after L1_TTL_MS. Subscribers run l1Del only.
      await redis.publish(INVALIDATION_CHANNEL, userId);
    } catch (err) {
      logger.warn('unreadNotificationsCache.invalidate failed', { userId, err });
    }
  },
};
