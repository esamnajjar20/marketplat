import { redis } from '../../config/redis';

/**
 * AUDIT-FIX 1.10/1.12: Cache-Control: no-store on GET /notifications and
 * GET /conversations is correct and must stay — that header governs the
 * browser/CDN layer, and caching a private, per-user response body at a
 * shared CDN would leak one user's notifications/messages to another
 * (see cacheControl.middleware.ts). The actual gap was a different layer
 * entirely: no server-side (Redis) cache for the one number that's
 * fetched on effectively every page load — the unread-notifications
 * badge count — so every request re-ran a COUNT(*) query.
 *
 * Same get/set/invalidate shape, silent-fail-on-Redis-error, and short
 * jittered TTL as userCache.ts, applied to a different keyspace. TTL is
 * intentionally short (unlike userCache's 5 minutes) because this value
 * changes far more often (any new notification, any read) and a stale
 * badge count is a visibly wrong number to a user in a way a stale
 * role/isActive flag usually isn't — the short TTL is a safety net for
 * cache-invalidation gaps, not the primary consistency mechanism
 * (explicit invalidate() calls on every write path are).
 */
const UNREAD_COUNT_CACHE_PREFIX = 'unread_notifications_count:';
const BASE_TTL = 30;
const JITTER = 15;

export const getUnreadNotificationsCacheKey = (userId: string): string =>
  `${UNREAD_COUNT_CACHE_PREFIX}${userId}`;

const getTTLWithJitter = (): number => BASE_TTL + Math.floor(Math.random() * JITTER);

export const unreadNotificationsCache = {
  get: async (userId: string): Promise<number | null> => {
    try {
      const cached = await redis.get(getUnreadNotificationsCacheKey(userId));
      if (cached === null) return null;
      const parsed = Number(cached);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },

  set: async (userId: string, count: number): Promise<void> => {
    try {
      await redis.setex(getUnreadNotificationsCacheKey(userId), getTTLWithJitter(), String(count));
    } catch {
      // silent fail — same convention as userCache.ts: a cache write
      // failure must never surface as a request failure.
    }
  },

  invalidate: async (userId: string): Promise<void> => {
    try {
      await redis.del(getUnreadNotificationsCacheKey(userId));
    } catch {
      // silent fail
    }
  },
};
