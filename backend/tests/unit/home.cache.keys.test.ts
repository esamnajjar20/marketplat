import {
  HOME_KEY_PREFIX,
  allHomeCacheKeys,
  homeCacheKeyForCity,
  invalidateHomeCache,
} from '../../src/modules/home/home.cache.keys';
import { HOME_CITIES } from '../../src/modules/home/home.validation';
import { redis } from '../../src/config/redis';

jest.mock('../../src/config/redis', () => ({ redis: { del: jest.fn() } }));
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

describe('home cache keys / invalidation (FIX HOME-CACHE-INVALIDATE-01)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (redis.del as jest.Mock).mockResolvedValue(1);
  });

  it('covers "general" plus every allow-listed city, all under the versioned prefix', () => {
    const keys = allHomeCacheKeys();
    expect(HOME_KEY_PREFIX).toBe('home:v3:');
    expect(keys).toHaveLength(HOME_CITIES.length + 1);
    expect(keys).toContain(homeCacheKeyForCity(undefined));
    for (const city of HOME_CITIES) expect(keys).toContain(`home:v3:${city}`);
  });

  it('deletes all known keys in one DEL (no SCAN)', async () => {
    await invalidateHomeCache();
    expect(redis.del).toHaveBeenCalledTimes(1);
    expect(redis.del).toHaveBeenCalledWith(...allHomeCacheKeys());
  });

  it('never throws when Redis fails', async () => {
    (redis.del as jest.Mock).mockRejectedValue(new Error('redis down'));
    await expect(invalidateHomeCache()).resolves.toBeUndefined();
  });
});
