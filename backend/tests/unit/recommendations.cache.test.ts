import {
  getCachedRecommendations,
  recommendationsCacheKey,
  normalizeRecommendationsQuery,
  RECS_GEN_KEY,
  RECS_MAX_CACHEABLE_CITY,
} from '../../src/modules/recommendations/recommendations.cache';
import { invalidateHomeCache } from '../../src/modules/home/home.cache.keys';
import * as redisModule from '../../src/config/redis';

jest.mock('../../src/config/redis', () => require('../helpers/fakeRedis.helper').fakeRedisModule());
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const fake = redisModule as unknown as { __store: Map<string, unknown> };

describe('recommendations cache (RECS-CACHE-01)', () => {
  beforeEach(() => fake.__store.clear());

  it('serves the second identical guest request from cache', async () => {
    const build = jest.fn().mockResolvedValue([{ id: 'a' }]);
    const first = await getCachedRecommendations({ limit: 8 }, null, build);
    const second = await getCachedRecommendations({ limit: 8 }, null, build);
    expect(build).toHaveBeenCalledTimes(1);
    expect(first.status).toBe('miss');
    expect(second.status).toBe('hit');
    expect(second.value).toEqual([{ id: 'a' }]);
  });

  it('never shares an entry between two users, or between a user and a guest', async () => {
    const build = jest
      .fn()
      .mockResolvedValueOnce(['for-u1'])
      .mockResolvedValueOnce(['for-u2'])
      .mockResolvedValueOnce(['for-guest']);
    const u1 = await getCachedRecommendations({ limit: 8 }, 'u1', build);
    const u2 = await getCachedRecommendations({ limit: 8 }, 'u2', build);
    const g = await getCachedRecommendations({ limit: 8 }, null, build);
    expect([u1.value, u2.value, g.value]).toEqual([['for-u1'], ['for-u2'], ['for-guest']]);
    expect(build).toHaveBeenCalledTimes(3);
  });

  it('keys differ by type, city, limit and exclusion id', () => {
    const base = recommendationsCacheKey({ limit: 8 }, null);
    expect(recommendationsCacheKey({ limit: 8, type: 'product' }, null)).not.toBe(base);
    expect(recommendationsCacheKey({ limit: 8, city: 'غزة' }, null)).not.toBe(base);
    expect(recommendationsCacheKey({ limit: 9 }, null)).not.toBe(base);
    expect(recommendationsCacheKey({ limit: 8, excludeAdId: 'x' }, null)).not.toBe(base);
  });

  it('rounds coordinates and hands the SAME normalized query to the builder', async () => {
    const build = jest.fn().mockResolvedValue([]);
    await getCachedRecommendations({ type: 'store', lat: 31.50123, lng: 34.46789 }, null, build);
    expect(build).toHaveBeenCalledWith(expect.objectContaining({ lat: 31.5, lng: 34.47 }));
    // a nearby caller in the same ~1km cell hits the same entry
    await getCachedRecommendations({ type: 'store', lat: 31.5049, lng: 34.4651 }, null, build);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('trims city in the normalized query', () => {
    expect(normalizeRecommendationsQuery({ city: '  غزة ' }).city).toBe('غزة');
  });

  it('does not cache very long (near-unique) city strings', async () => {
    const build = jest.fn().mockResolvedValue([]);
    const city = 'x'.repeat(RECS_MAX_CACHEABLE_CITY + 1);
    await getCachedRecommendations({ city }, null, build);
    await getCachedRecommendations({ city }, null, build);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('a home invalidation (takedown) hard-invalidates recommendations', async () => {
    let value = 'with-removed-ad';
    const build = jest.fn(async () => [value]);
    await getCachedRecommendations({ limit: 8 }, null, build);
    value = 'without-removed-ad';
    await invalidateHomeCache();
    // the listener bumps the generation without awaiting — let it settle
    await new Promise(resolve => setImmediate(resolve));
    expect(fake.__store.has(RECS_GEN_KEY)).toBe(true);
    const after = await getCachedRecommendations({ limit: 8 }, null, build);
    expect(after.value).toEqual(['without-removed-ad']);
  });

  it('does not pin a value the caller marks incomplete (shouldCache), so it heals next request', async () => {
    const build = jest
      .fn()
      .mockResolvedValueOnce({ ads: null, products: [], services: [] })
      .mockResolvedValueOnce({ ads: [{ id: 'a' }], products: [], services: [] });
    const complete = (v: { ads: unknown }) => v.ads !== null;
    const first = await getCachedRecommendations({ type: 'mixed', limit: 3 }, null, build, complete);
    const second = await getCachedRecommendations({ type: 'mixed', limit: 3 }, null, build, complete);
    expect(first.value.ads).toBeNull();
    expect(second.value.ads).toEqual([{ id: 'a' }]);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('mixed and single-type entries never collide', () => {
    expect(recommendationsCacheKey({ type: 'mixed', limit: 3 }, null)).not.toBe(
      recommendationsCacheKey({ limit: 3 }, null),
    );
  });
});
