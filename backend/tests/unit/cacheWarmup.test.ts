import {
  warmPublicCaches,
  runKeepWarmCycle,
  startCacheKeepWarm,
  WARMUP_TASKS,
  KEEP_WARM_LEADER_KEY,
} from '../../src/shared/utils/cacheWarmup';
import { HOME_CITIES } from '../../src/modules/home/home.validation';
import { resetCacheGuard } from '../../src/shared/utils/cacheGuard';
import * as redisModule from '../../src/config/redis';

jest.mock('../../src/config/redis', () => require('../helpers/fakeRedis.helper').fakeRedisModule());
jest.mock('../../src/modules/home/home.cache', () => ({
  ensureHomepageFresh: jest.fn().mockResolvedValue('fresh'),
  HOME_KEEPWARM_MAX_AGE_MS: 300_000,
}));
jest.mock('../../src/modules/categories/categories.service', () => ({
  categoriesService: { getCategories: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../../src/modules/product-categories/product-categories.service', () => ({
  productCategoriesService: { getProductCategories: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../../src/modules/service-categories/service-categories.service', () => ({
  serviceCategoriesService: { getServiceCategories: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../../src/modules/ads/ads.service', () => ({
  adsService: { getAds: jest.fn().mockResolvedValue({ items: [], meta: {} }) },
}));
jest.mock('../../src/modules/products/products.service', () => ({
  productsService: { getProducts: jest.fn().mockResolvedValue({ items: [], meta: {} }) },
}));
jest.mock('../../src/modules/stores/stores.service', () => ({
  storesService: { getStores: jest.fn().mockResolvedValue({ stores: [], meta: {} }) },
}));
jest.mock('../../src/modules/service-listings/service-listings.service', () => ({
  serviceListingsService: { getServiceListings: jest.fn().mockResolvedValue({ items: [], meta: {} }) },
}));
jest.mock('../../src/modules/service-providers/service-providers.service', () => ({
  serviceProvidersService: { getServiceProviders: jest.fn().mockResolvedValue({ providers: [], meta: {} }) },
}));
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const fake = redisModule as unknown as { redis: Record<string, jest.Mock>; __store: Map<string, unknown> };

describe('warmPublicCaches (FIX CACHE-WARMUP-01 / CACHE-KEEPWARM-01)', () => {
  beforeEach(() => {
    fake.__store.clear();
    resetCacheGuard();
  });

  it('covers general home, category trees, default ads lists, and every allow-listed city (FIX ADS-WARM-TTL-01)', () => {
    expect(WARMUP_TASKS.map(t => t.name)).toEqual([
      'home:general',
      'categories',
      'product-categories',
      'service-categories',
      'ads:list:default',
      'ads:list:featured',
      'products:list:default',
      'stores:list:default',
      'service-listings:list:default',
      'service-providers:list:default',
      ...HOME_CITIES.map(city => `home:${city}`),
    ]);
  });

  it('ads list warmup tasks call getAds with the default first-page queries', async () => {
    const { adsService } = jest.requireMock('../../src/modules/ads/ads.service') as {
      adsService: { getAds: jest.Mock };
    };
    adsService.getAds.mockClear();
    const defaultTask = WARMUP_TASKS.find(t => t.name === 'ads:list:default')!;
    const featuredTask = WARMUP_TASKS.find(t => t.name === 'ads:list:featured')!;
    await defaultTask.run();
    await featuredTask.run();
    expect(adsService.getAds).toHaveBeenNthCalledWith(1, {
      page: 1,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(adsService.getAds).toHaveBeenNthCalledWith(2, {
      isFeatured: true,
      limit: 4,
    });
  });

  it('home tasks are age-gated so an idle healthy cache is not rebuilt every cycle (FIX CACHE-KEEPWARM-AGE-01)', async () => {
    const { ensureHomepageFresh } = jest.requireMock('../../src/modules/home/home.cache') as {
      ensureHomepageFresh: jest.Mock;
    };
    ensureHomepageFresh.mockClear();
    await WARMUP_TASKS[0].run();
    expect(ensureHomepageFresh).toHaveBeenCalledWith({ city: undefined }, { maxAgeMs: 300_000 });
  });

  it('runs every task, sequentially, and reports counts', async () => {
    const order: string[] = [];
    const tasks = ['a', 'b', 'c'].map(name => ({
      name,
      run: async () => {
        order.push(`${name}:start`);
        await Promise.resolve();
        order.push(`${name}:end`);
      },
    }));
    await expect(warmPublicCaches(tasks)).resolves.toEqual({ ok: 3, failed: 0 });
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
  });

  it('a failing task never throws and never stops the remaining tasks', async () => {
    const ran: string[] = [];
    const result = await warmPublicCaches([
      { name: 'boom', run: async () => { throw new Error('redis down'); } },
      { name: 'after', run: async () => { ran.push('after'); } },
    ]);
    expect(result).toEqual({ ok: 1, failed: 1 });
    expect(ran).toEqual(['after']);
  });

  describe('keep-warm loop', () => {
    it('only the leader runs a cycle per interval (PM2 workers do not all rebuild)', async () => {
      const first = await runKeepWarmCycle(240_000);
      const second = await runKeepWarmCycle(240_000);
      expect(first).toEqual({ ok: WARMUP_TASKS.length, failed: 0 });
      expect(second).toBeNull();
      expect(fake.__store.has(KEEP_WARM_LEADER_KEY)).toBe(true);
    });

    it('skips the cycle (no throw) when Redis is unreachable', async () => {
      fake.redis.set.mockRejectedValueOnce(new Error('redis down'));
      await expect(runKeepWarmCycle(240_000)).resolves.toBeNull();
    });

    it('starts after the initial delay, repeats on the interval, and stops cleanly', async () => {
      jest.useFakeTimers();
      try {
        const stop = startCacheKeepWarm({ initialDelayMs: 100, intervalMs: 10_000 });
        const { ensureHomepageFresh } = jest.requireMock('../../src/modules/home/home.cache') as {
          ensureHomepageFresh: jest.Mock;
        };
        ensureHomepageFresh.mockClear();

        await jest.advanceTimersByTimeAsync(99);
        expect(ensureHomepageFresh).not.toHaveBeenCalled();
        await jest.advanceTimersByTimeAsync(10_000);
        expect(ensureHomepageFresh).toHaveBeenCalled();

        stop();
        ensureHomepageFresh.mockClear();
        fake.__store.clear();
        await jest.advanceTimersByTimeAsync(60_000);
        expect(ensureHomepageFresh).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
