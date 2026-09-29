import {
  getCachedHomepage,
  ensureHomepageFresh,
  homeCacheKey,
  HOME_CACHE_TTL_SECONDS,
  HOME_CACHE_TTL_JITTER_SECONDS,
  HOME_CACHE_HARD_TTL_SECONDS,
  HOME_REFRESH_LOCK_TTL_MS,
  HOME_REWARM_DELAY_MS,
  cancelPendingHomeRewarm,
} from '../../src/modules/home/home.cache';
import { HOME_GEN_KEY, invalidateHomeCache } from '../../src/modules/home/home.cache.keys';
import { homeService } from '../../src/modules/home/home.service';
import { resetCacheGuard } from '../../src/shared/utils/cacheGuard';
import * as redisModule from '../../src/config/redis';

jest.mock('../../src/config/redis', () => require('../helpers/fakeRedis.helper').fakeRedisModule());
jest.mock('../../src/modules/home/home.service', () => ({
  homeService: { getHomepage: jest.fn() },
  // real semantics: degraded when any section is null
  isHomepageDegraded: (p: { belowFold: { nearbyProviders: unknown } }) =>
    p.belowFold.nearbyProviders === null,
}));
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const fake = redisModule as unknown as {
  redis: Record<string, jest.Mock>;
  __store: Map<string, { value: string }>;
};

const full = { belowFold: { nearbyProviders: { items: [] } } };
const degraded = { belowFold: { nearbyProviders: null } };
const fresh = { belowFold: { nearbyProviders: { items: ['fresh'] } } };

const getHomepage = homeService.getHomepage as jest.Mock;
const flush = async (): Promise<void> => {
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
};
const stored = (key: string): { softExpiresAt: number; hard: string; payload: unknown } | null => {
  const entry = fake.__store.get(key);
  return entry ? JSON.parse(entry.value) : null;
};

describe('getCachedHomepage', () => {
  beforeEach(() => {
    fake.__store.clear();
    resetCacheGuard();
    getHomepage.mockReset();
    Object.values(fake.redis).forEach(fn => fn.mockClear());
  });

  // invalidateHomeCache() schedules a (unref'd) rewarm; never let it leak into the next test.
  afterEach(() => cancelPendingHomeRewarm());

  it('keys by city with a versioned prefix, and a stable key for "no city"', () => {
    expect(homeCacheKey({})).toBe('home:v4:general');
    expect(homeCacheKey({ city: 'رفح' })).toBe('home:v4:رفح');
  });

  it('assembles on a miss and stores an envelope stamped with the generation, with a hard TTL', async () => {
    getHomepage.mockResolvedValue(full);
    const before = Date.now();
    await getCachedHomepage({ city: 'غزة' });

    const envelope = stored('home:v4:غزة')!;
    expect(envelope.payload).toEqual(full);
    expect(envelope.hard).toBe(fake.__store.get(HOME_GEN_KEY)!.value);
    // FIX HOME-CACHE-JITTER-01: soft TTL = base + 0..jitter seconds.
    expect(envelope.softExpiresAt).toBeGreaterThanOrEqual(before + HOME_CACHE_TTL_SECONDS * 1000);
    expect(envelope.softExpiresAt).toBeLessThanOrEqual(
      Date.now() + (HOME_CACHE_TTL_SECONDS + HOME_CACHE_TTL_JITTER_SECONDS) * 1000,
    );
    const setCall = fake.redis.set.mock.calls.find(args => args[0] === 'home:v4:غزة')!;
    expect(setCall.slice(2)).toEqual(['EX', HOME_CACHE_HARD_TTL_SECONDS]);
  });

  it('serves a fresh entry without touching the service', async () => {
    getHomepage.mockResolvedValue(full);
    await getCachedHomepage({});
    getHomepage.mockClear();
    await expect(getCachedHomepage({})).resolves.toEqual(full);
    await flush();
    expect(getHomepage).not.toHaveBeenCalled();
  });

  it('does not cache a degraded payload', async () => {
    getHomepage.mockResolvedValue(degraded);
    await getCachedHomepage({});
    expect(fake.__store.has('home:v4:general')).toBe(false);
  });

  it('treats a legacy/malformed value (not an envelope) as a miss', async () => {
    getHomepage.mockResolvedValue(fresh);
    await fake.redis.set('home:v4:general', JSON.stringify(full));
    await expect(getCachedHomepage({})).resolves.toEqual(fresh);
  });

  describe('stale-while-revalidate', () => {
    const seedStale = async (): Promise<void> => {
      getHomepage.mockResolvedValue(full);
      await getCachedHomepage({});
      const envelope = stored('home:v4:general')!;
      envelope.softExpiresAt = Date.now() - 1_000;
      fake.__store.get('home:v4:general')!.value = JSON.stringify(envelope);
      getHomepage.mockReset();
    };

    it('returns the stale payload immediately and refreshes in the background', async () => {
      await seedStale();
      getHomepage.mockResolvedValue(fresh);
      await expect(getCachedHomepage({})).resolves.toEqual(full); // stale, not the new one
      await flush();
      expect(getHomepage).toHaveBeenCalledTimes(1);
      expect(stored('home:v4:general')!.payload).toEqual(fresh);
    });

    it('takes a cross-process lock (SET NX PX) before refreshing', async () => {
      await seedStale();
      getHomepage.mockResolvedValue(fresh);
      await getCachedHomepage({});
      await flush();
      expect(fake.redis.set).toHaveBeenCalledWith(
        'home:v4:general:refresh-lock',
        expect.any(String),
        'PX',
        HOME_REFRESH_LOCK_TTL_MS,
        'NX',
      );
    });

    it('does not rebuild when another process holds the refresh lock', async () => {
      await seedStale();
      await fake.redis.set('home:v4:general:refresh-lock', 'other', 'PX', 5_000, 'NX');
      await expect(getCachedHomepage({})).resolves.toEqual(full);
      await flush();
      expect(getHomepage).not.toHaveBeenCalled();
    });

    it('keeps serving stale (no throw) when the background refresh fails', async () => {
      await seedStale();
      getHomepage.mockRejectedValue(new Error('db down'));
      await expect(getCachedHomepage({})).resolves.toEqual(full);
      await flush();
      expect(stored('home:v4:general')!.payload).toEqual(full);
    });

    it('starts only one refresh for concurrent stale reads in a process', async () => {
      await seedStale();
      let release!: (v: unknown) => void;
      getHomepage.mockImplementation(() => new Promise(resolve => { release = resolve; }));
      await Promise.all([getCachedHomepage({}), getCachedHomepage({}), getCachedHomepage({})]);
      await flush();
      release(fresh);
      await flush();
      expect(getHomepage).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidation (FIX HOME-CACHE-RACE-01)', () => {
    it('never serves an entry from before an invalidation', async () => {
      getHomepage.mockResolvedValue(full);
      await getCachedHomepage({});
      await invalidateHomeCache();
      getHomepage.mockResolvedValue(fresh);
      await expect(getCachedHomepage({})).resolves.toEqual(fresh);
    });

    it('a refresh already running when the invalidation lands cannot resurrect the old payload', async () => {
      getHomepage.mockResolvedValue(full);
      await getCachedHomepage({});
      const envelope = stored('home:v4:general')!;
      envelope.softExpiresAt = Date.now() - 1_000;
      fake.__store.get('home:v4:general')!.value = JSON.stringify(envelope);

      let release!: (v: unknown) => void;
      getHomepage.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
      await getCachedHomepage({}); // stale served; background refresh (old data) now in flight
      await flush();

      await invalidateHomeCache(); // the ad is removed here
      release(full); // the old refresh finishes AFTER the invalidation and writes its result
      await flush();

      getHomepage.mockResolvedValue(fresh);
      await expect(getCachedHomepage({})).resolves.toEqual(fresh);
    });

    it('re-warms the general homepage shortly after an invalidation (debounced)', async () => {
      jest.useFakeTimers();
      try {
        getHomepage.mockResolvedValue(fresh);
        await invalidateHomeCache();
        await invalidateHomeCache();
        await jest.advanceTimersByTimeAsync(HOME_REWARM_DELAY_MS + 50);
        expect(getHomepage).toHaveBeenCalledTimes(1);
        expect(stored('home:v4:general')!.payload).toEqual(fresh);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('ensureHomepageFresh (keep-warm)', () => {
    it('builds a missing key, then reports fresh without rebuilding', async () => {
      getHomepage.mockResolvedValue(full);
      await expect(ensureHomepageFresh({ city: 'رفح' })).resolves.toBe('refreshed');
      await expect(ensureHomepageFresh({ city: 'رفح' })).resolves.toBe('fresh');
      expect(getHomepage).toHaveBeenCalledTimes(1);
    });
  });

  it('falls through to the service when Redis reads fail', async () => {
    fake.redis.mget.mockRejectedValueOnce(new Error('redis down'));
    getHomepage.mockResolvedValue(full);
    await expect(getCachedHomepage({})).resolves.toEqual(full);
  });

  it('falls through to the service when a Redis read hangs (cache timeout)', async () => {
    jest.useFakeTimers();
    try {
      fake.redis.mget.mockReturnValueOnce(new Promise(() => {})); // never settles
      getHomepage.mockResolvedValue(full);
      const pending = getCachedHomepage({});
      await jest.advanceTimersByTimeAsync(400);
      await expect(pending).resolves.toEqual(full);
    } finally {
      jest.useRealTimers();
    }
  });

  it('still returns the payload when the cache write fails', async () => {
    getHomepage.mockResolvedValue(full);
    const realSet = fake.redis.set.getMockImplementation()!;
    fake.redis.set.mockImplementation(async (key: string, ...rest: unknown[]) => {
      if (key === 'home:v4:general') throw new Error('redis down');
      return realSet(key, ...(rest as [string]));
    });
    await expect(getCachedHomepage({})).resolves.toEqual(full);
    fake.redis.set.mockImplementation(realSet);
  });

  it('shares one in-flight assembly between concurrent misses', async () => {
    let release!: (v: unknown) => void;
    getHomepage.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const a = getCachedHomepage({ city: 'خان يونس' });
    const b = getCachedHomepage({ city: 'خان يونس' });
    await flush();
    release(full);
    await Promise.all([a, b]);
    expect(getHomepage).toHaveBeenCalledTimes(1);
  });

  it('propagates a service failure and clears the in-flight entry', async () => {
    getHomepage.mockRejectedValueOnce(new Error('all failed'));
    await expect(getCachedHomepage({})).rejects.toThrow('all failed');
    getHomepage.mockResolvedValueOnce(full);
    await expect(getCachedHomepage({})).resolves.toEqual(full);
  });
});
