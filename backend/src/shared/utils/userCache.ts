import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { logger } from './logger';

const USER_CACHE_PREFIX = 'user_cache:';
const BASE_TTL = 5 * 60;
const JITTER = 60;

// AUDIT-FIX M-01: exported so any other module needing this exact key
// format (e.g. auth.middleware.ts's pipelined GET) imports it instead
// of redeclaring USER_CACHE_PREFIX locally — a duplicated constant
// silently diverges if this format ever changes in only one place.
export const getUserCacheKey = (userId: string): string => `${USER_CACHE_PREFIX}${userId}`;

// Single Flight — طلب واحد فقط يذهب للـ DB لنفس userId
const inflightMap = new Map<string, Promise<CachedUser | null>>();

const getTTLWithJitter = (): number => BASE_TTL + Math.floor(Math.random() * JITTER);

export interface CachedUser {
  id: string;
  role: string;
  isActive: boolean;
}

export const userCache = {
  get: async (userId: string): Promise<CachedUser | null> => {
    try {
      const cached = await redis.get(getUserCacheKey(userId));
      return cached ? (JSON.parse(cached) as CachedUser) : null;
    } catch {
      return null;
    }
  },

  set: async (user: CachedUser): Promise<void> => {
    try {
      await redis.setex(getUserCacheKey(user.id), getTTLWithJitter(), JSON.stringify(user));
    } catch {
      // silent fail
    }
  },

  invalidate: async (userId: string): Promise<void> => {
    try {
      await redis.del(getUserCacheKey(userId));
    } catch {
      // silent fail
    }
  },

  getOrFetch: async (userId: string): Promise<CachedUser | null> => {
    const cached = await userCache.get(userId);
    if (cached) return cached;

    // Single Flight: إذا يوجد طلب جاري، انتظره
    const existing = inflightMap.get(userId);
    if (existing) return existing;

    const fetchPromise = (async (): Promise<CachedUser | null> => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, isActive: true },
        });
        if (!user) return null;

        const cachedUser: CachedUser = {
          id: user.id,
          role: user.role as string,
          isActive: user.isActive,
        };

        await userCache.set(cachedUser);
        return cachedUser;
      } catch (err) {
        logger.error('Failed to fetch user for cache', { userId, err });
        return null;
      } finally {
        inflightMap.delete(userId);
      }
    })();

    inflightMap.set(userId, fetchPromise);
    return fetchPromise;
  },
};
