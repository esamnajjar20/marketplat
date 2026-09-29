import {
  bumpGeneration,
  swrEnsureFresh,
  swrGet,
  swrGetWithStatus,
  type SwrOptions,
} from '../../src/shared/utils/swrCache';
import { cacheMetrics } from '../../src/shared/utils/cacheMetrics';
import { resetCacheGuard } from '../../src/shared/utils/cacheGuard';
import * as redisModule from '../../src/config/redis';

jest.mock('../../src/config/redis', () => require('../helpers/fakeRedis.helper').fakeRedisModule());
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const fake = redisModule as unknown as {
  redis: Record<string, jest.Mock>;
  __store: Map<string, unknown>;
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

interface Payload {
  v: string;
}

function setup(over: Partial<SwrOptions<Payload>> = {}, buildMs = 5) {
  let version = 'A';
  let builds = 0;
  const options: SwrOptions<Payload> = {
    name: 'test',
    key: 'k',
    hardGenKey: 'gen:hard',
    softTtlMs: () => 50,
    hardTtlSec: 60,
    lockTtlMs: 5_000,
    build: async () => {
      builds += 1;
      await sleep(buildMs);
      return { v: version };
    },
    ...over,
  };
  return { options, setVersion: (v: string) => { version = v; }, builds: () => builds };
}

describe('swrCache (FIX SWR-ENGINE-01)', () => {
  beforeEach(() => {
    fake.__store.clear();
    cacheMetrics.reset();
    resetCacheGuard();
    Object.values(fake.redis).forEach(fn => fn.mockClear());
  });

  it('builds on a miss, then serves a hit without rebuilding', async () => {
    const { options, builds } = setup();
    expect((await swrGetWithStatus(options)).status).toBe('miss');
    expect((await swrGetWithStatus(options)).status).toBe('hit');
    expect(builds()).toBe(1);
  });

  it('reads value + generations in ONE mget (no second round trip)', async () => {
    const { options } = setup({ softGenKey: 'gen:soft' });
    await swrGet(options);
    fake.redis.get.mockClear();
    fake.redis.mget.mockClear();
    await swrGet(options);
    expect(fake.redis.mget).toHaveBeenCalledTimes(1);
    expect(fake.redis.mget).toHaveBeenCalledWith('k', 'gen:hard', 'gen:soft');
    expect(fake.redis.get).not.toHaveBeenCalled();
  });

  it('after the soft TTL serves stale instantly and refreshes exactly once in the background', async () => {
    const { options, builds, setVersion } = setup();
    await swrGet(options);
    await sleep(70);
    setVersion('B');
    const stale = await swrGetWithStatus(options);
    expect(stale.status).toBe('stale');
    expect(stale.value.v).toBe('A');
    await Promise.all([swrGet(options), swrGet(options)]);
    await sleep(30);
    expect(builds()).toBe(2);
    expect((await swrGet(options)).v).toBe('B');
  });

  it('RACE: a refresh that started before an invalidation can never resurrect removed data', async () => {
    const { options, setVersion } = setup({}, 40);
    await swrGet(options);
    await sleep(70); // entry is now stale
    await swrGet(options); // serves stale; slow background refresh starts and reads OLD data
    await sleep(5);
    setVersion('REMOVED'); // the ad is deleted…
    await bumpGeneration('gen:hard'); // …and the cache invalidated while the refresh is in flight
    await sleep(60); // the old refresh now finishes and writes AFTER the invalidation

    const result = await swrGetWithStatus(options);
    expect(result.status).toBe('miss'); // old-generation envelope is ignored
    expect(result.value.v).toBe('REMOVED');
  });

  it('a request after an invalidation does not join a pre-invalidation in-flight build', async () => {
    const { options, setVersion } = setup({}, 40);
    const first = swrGet(options);
    await sleep(5);
    setVersion('NEW');
    await bumpGeneration('gen:hard');
    expect((await swrGet(options)).v).toBe('NEW');
    await first;
  });

  it('soft generation: serves the previous payload once, refreshes in background', async () => {
    const { options, builds, setVersion } = setup({ softGenKey: 'gen:soft', softTtlMs: () => 60_000 });
    await swrGet(options);
    setVersion('B');
    await bumpGeneration('gen:soft');
    const result = await swrGetWithStatus(options);
    expect(result.status).toBe('stale');
    expect(result.value.v).toBe('A');
    await sleep(30);
    expect(builds()).toBe(2);
    expect((await swrGetWithStatus(options)).status).toBe('hit');
  });

  it('hard generation always wins over the soft one: never serves stale after a hard bump', async () => {
    const { options, setVersion } = setup({ softGenKey: 'gen:soft', softTtlMs: () => 60_000 });
    await swrGet(options);
    setVersion('GONE');
    await bumpGeneration('gen:hard');
    const result = await swrGetWithStatus(options);
    expect(result.status).toBe('miss');
    expect(result.value.v).toBe('GONE');
  });

  it('an evicted generation key never re-validates an old envelope', async () => {
    const { options, setVersion } = setup();
    await swrGet(options);
    fake.__store.delete('gen:hard');
    setVersion('B');
    const result = await swrGetWithStatus(options);
    expect(result.status).toBe('miss');
    expect(result.value.v).toBe('B');
  });

  it('does not cache values rejected by shouldCache', async () => {
    const { options, builds } = setup({ shouldCache: () => false });
    await swrGet(options);
    await swrGet(options);
    expect(builds()).toBe(2);
  });

  it('falls back to the build (status bypass) when Redis reads fail', async () => {
    fake.redis.mget.mockRejectedValueOnce(new Error('redis down'));
    const { options } = setup();
    expect((await swrGetWithStatus(options)).status).toBe('bypass');
    expect(cacheMetrics.snapshot().test.bypass).toBe(1);
  });

  it('uncacheable queries skip Redis but are still singleflighted', async () => {
    const { options, builds } = setup({ cacheable: false }, 20);
    await Promise.all([swrGet(options), swrGet(options), swrGet(options)]);
    expect(builds()).toBe(1);
    expect(fake.redis.mget).not.toHaveBeenCalled();
  });

  it('does not refresh when another process holds the lock (lock_skip)', async () => {
    const { options, builds } = setup();
    await swrGet(options);
    await sleep(70);
    await fake.redis.set('k:refresh-lock', 'other-process', 'PX', 5_000, 'NX');
    expect((await swrGetWithStatus(options)).status).toBe('stale');
    await sleep(20);
    expect(builds()).toBe(1);
    expect(cacheMetrics.snapshot().test.lock_skip).toBe(1);
  });

  it('releases its own lock after refreshing so the next refresh is not blocked', async () => {
    const { options, builds } = setup();
    await swrGet(options);
    await sleep(70);
    await swrGet(options);
    await sleep(30);
    expect(fake.__store.has('k:refresh-lock')).toBe(false);
    expect(builds()).toBe(2);
  });

  it('keeps serving stale (no throw) when the background refresh fails', async () => {
    let fail = false;
    const { options } = setup({
      build: async () => {
        if (fail) throw new Error('db down');
        return { v: 'A' };
      },
    });
    await swrGet(options);
    await sleep(70);
    fail = true;
    expect((await swrGetWithStatus(options)).status).toBe('stale');
    await sleep(20);
    expect(cacheMetrics.snapshot().test.refresh_fail).toBe(1);
    expect(fake.__store.has('k:refresh-lock')).toBe(false);
  });

  describe('swrEnsureFresh (keep-warm)', () => {
    it('refreshes a missing key, skips a fresh one, rebuilds an expired one', async () => {
      const { options, builds } = setup();
      expect(await swrEnsureFresh(options)).toBe('refreshed');
      expect(await swrEnsureFresh(options)).toBe('fresh');
      expect(builds()).toBe(1);
      await sleep(70);
      expect(await swrEnsureFresh(options)).toBe('refreshed');
      expect(builds()).toBe(2);
    });

    it('is skipped when another process holds the refresh lock', async () => {
      const { options } = setup();
      await fake.redis.set('k:refresh-lock', 'x', 'PX', 5_000, 'NX');
      expect(await swrEnsureFresh(options)).toBe('skipped');
    });

    it('rejects when Redis is unreachable (the caller logs and skips the cycle)', async () => {
      fake.redis.mget.mockRejectedValueOnce(new Error('redis down'));
      const { options } = setup();
      await expect(swrEnsureFresh(options)).rejects.toThrow();
    });
  });

  it('bumpGeneration never throws and reports failure', async () => {
    // bumpGeneration tries twice before giving up.
    fake.redis.set
      .mockRejectedValueOnce(new Error('redis down'))
      .mockRejectedValueOnce(new Error('redis down'));
    await expect(bumpGeneration('gen:hard')).resolves.toBe(false);
  });
});
