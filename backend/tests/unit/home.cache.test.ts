import {
  getCachedHomepage,
  homeCacheKey,
  HOME_CACHE_TTL_SECONDS,
  HOME_CACHE_TTL_JITTER_SECONDS,
  HOME_CACHE_HARD_TTL_SECONDS,
  HOME_REFRESH_LOCK_TTL_MS,
} from '../../src/modules/home/home.cache';
import { homeService } from '../../src/modules/home/home.service';
import { redis } from '../../src/config/redis';

jest.mock('../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));
jest.mock('../../src/modules/home/home.service', () => ({
  homeService: { getHomepage: jest.fn() },
  // real semantics: degraded when any section is null
  isHomepageDegraded: (p: { belowFold: { nearbyProviders: unknown } }) =>
    p.belowFold.nearbyProviders === null,
}));
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const full = { belowFold: { nearbyProviders: { items: [] } } };
const degraded = { belowFold: { nearbyProviders: null } };
const fresh = { belowFold: { nearbyProviders: { items: ['fresh'] } } };

const envelope = (payload: unknown, softExpiresAt: number): string =>
  JSON.stringify({ softExpiresAt, payload });

// Lets fire-and-forget background work (lock -> assemble -> write) settle.
const flush = async (): Promise<void> => {
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
};

const isLockCall = (args: unknown[]): boolean => args.includes('NX');
const writeCalls = (): unknown[][] =>
  (redis.set as jest.Mock).mock.calls.filter(args => !isLockCall(args));

describe('getCachedHomepage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue('OK');
  });

  it('keys by city with a versioned prefix, and a stable key for "no city"', () => {
    expect(homeCacheKey({})).toBe('home:v3:general');
    expect(homeCacheKey({ city: 'رفح' })).toBe('home:v3:رفح');
  });

  it('serves a fresh entry without touching the service or refreshing', async () => {
    (redis.get as jest.Mock).mockResolvedValue(envelope(full, Date.now() + 20_000));
    const result = await getCachedHomepage({});
    await flush();
    expect(result).toEqual(full);
    expect(homeService.getHomepage).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('assembles on a miss and stores an envelope with a hard TTL', async () => {
    (homeService.getHomepage as jest.Mock).mockResolvedValue(full);
    const before = Date.now();
    await getCachedHomepage({ city: 'غزة' });

    const calls = writeCalls();
    expect(calls).toHaveLength(1);
    const [key, value, mode, ttl] = calls[0] as [string, string, string, number];
    expect(key).toBe('home:v3:غزة');
    expect(mode).toBe('EX');
    expect(ttl).toBe(HOME_CACHE_HARD_TTL_SECONDS);

    const stored = JSON.parse(value) as { softExpiresAt: number; payload: unknown };
    expect(stored.payload).toEqual(full);
    // FIX HOME-CACHE-JITTER-01: soft TTL = base + 0..jitter seconds.
    expect(stored.softExpiresAt).toBeGreaterThanOrEqual(before + HOME_CACHE_TTL_SECONDS * 1000);
    expect(stored.softExpiresAt).toBeLessThanOrEqual(
      Date.now() + (HOME_CACHE_TTL_SECONDS + HOME_CACHE_TTL_JITTER_SECONDS) * 1000,
    );
  });

  it('does not cache a degraded payload', async () => {
    (homeService.getHomepage as jest.Mock).mockResolvedValue(degraded);
    await getCachedHomepage({});
    expect(writeCalls()).toHaveLength(0);
  });

  it('treats a legacy/malformed value (not an envelope) as a miss', async () => {
    (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(full));
    (homeService.getHomepage as jest.Mock).mockResolvedValue(fresh);
    await expect(getCachedHomepage({})).resolves.toEqual(fresh);
  });

  describe('stale-while-revalidate', () => {
    it('returns the stale payload immediately and refreshes in the background', async () => {
      (redis.get as jest.Mock).mockResolvedValue(envelope(full, Date.now() - 1_000));
      (homeService.getHomepage as jest.Mock).mockResolvedValue(fresh);

      const result = await getCachedHomepage({});
      expect(result).toEqual(full); // stale, not the freshly built one

      await flush();
      expect(homeService.getHomepage).toHaveBeenCalledTimes(1);
      const stored = JSON.parse(writeCalls()[0][1] as string) as { payload: unknown };
      expect(stored.payload).toEqual(fresh);
    });

    it('takes a cross-process lock (SET NX PX) before refreshing', async () => {
      (redis.get as jest.Mock).mockResolvedValue(envelope(full, Date.now() - 1_000));
      (homeService.getHomepage as jest.Mock).mockResolvedValue(fresh);
      await getCachedHomepage({});
      await flush();
      expect(redis.set).toHaveBeenCalledWith(
        'home:v3:general:refresh-lock',
        '1',
        'PX',
        HOME_REFRESH_LOCK_TTL_MS,
        'NX',
      );
    });

    it('does not rebuild when another process holds the refresh lock', async () => {
      (redis.get as jest.Mock).mockResolvedValue(envelope(full, Date.now() - 1_000));
      (redis.set as jest.Mock).mockResolvedValue(null); // NX not acquired
      const result = await getCachedHomepage({});
      await flush();
      expect(result).toEqual(full);
      expect(homeService.getHomepage).not.toHaveBeenCalled();
    });

    it('keeps serving stale (no throw) when the background refresh fails', async () => {
      (redis.get as jest.Mock).mockResolvedValue(envelope(full, Date.now() - 1_000));
      (homeService.getHomepage as jest.Mock).mockRejectedValue(new Error('db down'));
      await expect(getCachedHomepage({})).resolves.toEqual(full);
      await flush(); // must not surface an unhandled rejection
      expect(writeCalls()).toHaveLength(0);
    });

    it('starts only one refresh for concurrent stale reads in a process', async () => {
      (redis.get as jest.Mock).mockResolvedValue(envelope(full, Date.now() - 1_000));
      let release!: (v: unknown) => void;
      (homeService.getHomepage as jest.Mock).mockImplementation(
        () => new Promise(resolve => { release = resolve; }),
      );
      await Promise.all([getCachedHomepage({}), getCachedHomepage({}), getCachedHomepage({})]);
      await flush();
      release(fresh);
      await flush();
      expect(homeService.getHomepage).toHaveBeenCalledTimes(1);
    });
  });

  it('falls through to the service when Redis reads fail', async () => {
    (redis.get as jest.Mock).mockRejectedValue(new Error('redis down'));
    (homeService.getHomepage as jest.Mock).mockResolvedValue(full);
    await expect(getCachedHomepage({})).resolves.toEqual(full);
  });

  it('falls through to the service when a Redis read hangs (cache timeout)', async () => {
    jest.useFakeTimers();
    try {
      (redis.get as jest.Mock).mockReturnValue(new Promise(() => {})); // never settles
      (homeService.getHomepage as jest.Mock).mockResolvedValue(full);
      const pending = getCachedHomepage({});
      await jest.advanceTimersByTimeAsync(400);
      await expect(pending).resolves.toEqual(full);
    } finally {
      jest.useRealTimers();
    }
  });

  it('still returns the payload when the cache write fails', async () => {
    (redis.set as jest.Mock).mockRejectedValue(new Error('redis down'));
    (homeService.getHomepage as jest.Mock).mockResolvedValue(full);
    await expect(getCachedHomepage({})).resolves.toEqual(full);
  });

  it('shares one in-flight assembly between concurrent misses', async () => {
    let release!: (v: unknown) => void;
    (homeService.getHomepage as jest.Mock).mockImplementation(
      () => new Promise(resolve => { release = resolve; }),
    );
    const a = getCachedHomepage({ city: 'خان يونس' });
    const b = getCachedHomepage({ city: 'خان يونس' });
    await new Promise(r => setImmediate(r));
    release(full);
    await Promise.all([a, b]);
    expect(homeService.getHomepage).toHaveBeenCalledTimes(1);
  });

  it('propagates a service failure and clears the in-flight entry', async () => {
    (homeService.getHomepage as jest.Mock).mockRejectedValueOnce(new Error('all failed'));
    await expect(getCachedHomepage({})).rejects.toThrow('all failed');
    (homeService.getHomepage as jest.Mock).mockResolvedValueOnce(full);
    await expect(getCachedHomepage({})).resolves.toEqual(full);
  });
});
