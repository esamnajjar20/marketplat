import {
  cachedPublicList,
  bumpPublicListCache,
  hidePublicEntities,
  publicListCacheKey,
  PUBLIC_LIST_MAX_CACHEABLE_TEXT,
} from '../../src/shared/utils/publicListCache';
import { invalidateHomeCache } from '../../src/modules/home/home.cache.keys';
import * as redisModule from '../../src/config/redis';

jest.mock('../../src/config/redis', () => require('../helpers/fakeRedis.helper').fakeRedisModule());
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/modules/home/home.cache.keys', () => ({ invalidateHomeCache: jest.fn() }));

const fake = redisModule as unknown as { __store: Map<string, unknown> };

describe('publicListCache (FIX PUBLIC-LIST-CACHE-01)', () => {
  beforeEach(() => {
    fake.__store.clear();
    (invalidateHomeCache as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  it('builds a stable key regardless of property order, and separates namespaces', () => {
    expect(publicListCacheKey('products', { page: 1, city: 'غزة' })).toBe(
      publicListCacheKey('products', { city: 'غزة', page: 1 }),
    );
    expect(publicListCacheKey('products', { page: 1 })).not.toBe(publicListCacheKey('stores', { page: 1 }));
    expect(publicListCacheKey('products', { page: 1 })).not.toBe(publicListCacheKey('products', { page: 2 }));
  });

  it('bounds key length for very large queries', () => {
    const key = publicListCacheKey('products', { q: 'x'.repeat(500) });
    expect(key.length).toBeLessThan(120);
  });

  it('serves the second identical query from cache', async () => {
    const build = jest.fn().mockResolvedValue({ items: [1] });
    await cachedPublicList('stores', { page: 1 }, build);
    await cachedPublicList('stores', { page: 1 }, build);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('does not cache long free-text searches', async () => {
    const build = jest.fn().mockResolvedValue({ items: [] });
    const q = 'a'.repeat(PUBLIC_LIST_MAX_CACHEABLE_TEXT + 1);
    await cachedPublicList('products', { q }, build);
    await cachedPublicList('products', { q }, build);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('bumpPublicListCache (edit) is SOFT: serves the previous page once, refreshes in the background', async () => {
    let value = 'A';
    const build = jest.fn(async () => ({ v: value }));
    await cachedPublicList('products', { page: 1 }, build);
    value = 'B';
    await bumpPublicListCache('products');

    expect((await cachedPublicList('products', { page: 1 }, build)).v).toBe('A');
    await new Promise(r => setImmediate(r));
    await new Promise(r => setImmediate(r));
    expect(build).toHaveBeenCalledTimes(2);
    expect((await cachedPublicList('products', { page: 1 }, build)).v).toBe('B');
  });

  it('invalidation is scoped to its namespace', async () => {
    const stores = jest.fn().mockResolvedValue({ n: 'stores' });
    const products = jest.fn().mockResolvedValue({ n: 'products' });
    await cachedPublicList('stores', { page: 1 }, stores);
    await cachedPublicList('products', { page: 1 }, products);

    await hidePublicEntities('products');
    await cachedPublicList('stores', { page: 1 }, stores);
    await cachedPublicList('products', { page: 1 }, products);

    expect(stores).toHaveBeenCalledTimes(1);
    expect(products).toHaveBeenCalledTimes(2);
  });

  it('hidePublicEntities is HARD: never serves the old page, and also invalidates the homepage', async () => {
    const build = jest.fn().mockResolvedValue({ items: [] });
    await cachedPublicList('service-listings', { page: 1 }, build);
    await hidePublicEntities('service-listings');
    await cachedPublicList('service-listings', { page: 1 }, build);
    expect(build).toHaveBeenCalledTimes(2);
    expect(invalidateHomeCache).toHaveBeenCalledTimes(1);
  });
});
