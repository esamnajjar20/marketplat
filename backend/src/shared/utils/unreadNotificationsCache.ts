import { redis } from '../../config/redis';

const UNREAD_COUNT_CACHE_PREFIX = 'unread_notifications_count:';
const BASE_TTL = 45;
const JITTER = 15;
const L1_TTL_MS = 12_000;
const L1 = new Map<string, { count: number; exp: number }>();

export const getUnreadNotificationsCacheKey = (userId: string): string =>
  `${UNREAD_COUNT_CACHE_PREFIX}${userId}`;

const getTTLWithJitter = (): number => BASE_TTL + Math.floor(Math.random() * JITTER);

export const unreadNotificationsCache = {
  get: async (userId: string): Promise<number | null> => {
    const local = L1.get(userId);
    if (local && Date.now() <= local.exp) return local.count;
    if (local) L1.delete(userId);

    try {
      const cached = await redis.get(getUnreadNotificationsCacheKey(userId));
      if (cached === null) return null;
      const parsed = Number(cached);
      if (!Number.isFinite(parsed)) return null;
      L1.set(userId, { count: parsed, exp: Date.now() + L1_TTL_MS });
      return parsed;
    } catch {
      return null;
    }
  },

  set: async (userId: string, count: number): Promise<void> => {
    L1.set(userId, { count, exp: Date.now() + L1_TTL_MS });
    try {
      await redis.setex(getUnreadNotificationsCacheKey(userId), getTTLWithJitter(), String(count));
    } catch {
      // silent fail
    }
  },

  invalidate: async (userId: string): Promise<void> => {
    L1.delete(userId);
    try {
      await redis.del(getUnreadNotificationsCacheKey(userId));
    } catch {
      // silent fail
    }
  },
};
