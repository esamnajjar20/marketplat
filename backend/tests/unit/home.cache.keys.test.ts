import {
  HOME_KEY_PREFIX,
  HOME_GEN_KEY,
  allHomeCacheKeys,
  homeCacheKeyForCity,
  invalidateHomeCache,
  onHomeInvalidated,
} from '../../src/modules/home/home.cache.keys';
import { HOME_CITIES } from '../../src/modules/home/home.validation';
import * as redisModule from '../../src/config/redis';

jest.mock('../../src/config/redis', () => require('../helpers/fakeRedis.helper').fakeRedisModule());
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const fake = redisModule as unknown as {
  redis: Record<string, jest.Mock>;
  __store: Map<string, { value: string }>;
};

describe('home cache keys / invalidation (FIX HOME-CACHE-INVALIDATE-01 / RACE-01)', () => {
  beforeEach(() => {
    fake.__store.clear();
    Object.values(fake.redis).forEach(fn => fn.mockClear());
  });

  it('covers "general" plus every allow-listed city, all under the versioned prefix', () => {
    const keys = allHomeCacheKeys();
    expect(HOME_KEY_PREFIX).toBe('home:v4:');
    expect(keys).toHaveLength(HOME_CITIES.length + 1);
    expect(keys).toContain(homeCacheKeyForCity(undefined));
    for (const city of HOME_CITIES) expect(keys).toContain(`home:v4:${city}`);
  });

  it('invalidates by overwriting ONE generation token (no DEL, no SCAN)', async () => {
    await invalidateHomeCache();
    const first = fake.__store.get(HOME_GEN_KEY)!.value;
    await invalidateHomeCache();
    const second = fake.__store.get(HOME_GEN_KEY)!.value;
    expect(first).not.toBe(second);
    expect(fake.redis.del).not.toHaveBeenCalled();
  });

  it('notifies listeners after a successful invalidation', async () => {
    const listener = jest.fn();
    const off = onHomeInvalidated(listener);
    await invalidateHomeCache();
    off();
    await invalidateHomeCache();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('never throws when Redis fails, and does not notify listeners', async () => {
    const listener = jest.fn();
    const off = onHomeInvalidated(listener);
    fake.redis.set.mockRejectedValueOnce(new Error('redis down')).mockRejectedValueOnce(new Error('redis down'));
    await expect(invalidateHomeCache()).resolves.toBeUndefined();
    off();
    expect(listener).not.toHaveBeenCalled();
  });
});
