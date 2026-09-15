import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { logger } from './logger';

const USER_CACHE_PREFIX = 'user_cache:';
const BASE_TTL = 5 * 60;
const JITTER = 60;
const L1_TTL_MS = 30_000;
const L1 = new Map<string, { user: CachedUser; exp: number }>();

export const getUserCacheKey = (userId: string): string => `${USER_CACHE_PREFIX}${userId}`;

const inflightMap = new Map<string, Promise<CachedUser | null>>();

const getTTLWithJitter = (): number => BASE_TTL + Math.floor(Math.random() * JITTER);

export interface CachedUser {
  id: string;
  role: string;
  isActive: boolean;
}

function l1Get(userId: string): CachedUser | null {
  const hit = L1.get(userId);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    L1.delete(userId);
    return null;
  }
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
    } catch {
      return null;
    }
  },

  set: async (user: CachedUser): Promise<void> => {
    l1Set(user);
    try {
      await redis.setex(getUserCacheKey(user.id), getTTLWithJitter(), JSON.stringify(user));
    } catch {
      // silent fail
    }
  },

  invalidate: async (userId: string): Promise<void> => {
    l1Del(userId);
    try {
      await redis.del(getUserCacheKey(userId));
    } catch {
      // silent fail
    }
  },

  getOrFetch: async (userId: string): Promise<CachedUser | null> => {
    const cached = await userCache.get(userId);
    if (cached) return cached;

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
