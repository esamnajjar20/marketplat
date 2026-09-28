import { getCachedHomepage, homeCacheKey, HOME_CACHE_TTL_SECONDS } from '../../src/modules/home/home.cache';
import { homeService } from '../../src/modules/home/home.service';
import { redis } from '../../src/config/redis';

jest.mock('../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn() },
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

describe('getCachedHomepage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (redis.get as jest.Mock).mockResolvedValue(null);
    (redis.set as jest.Mock).mockResolvedValue('OK');
  });

  it('keys by city, with a stable key for "no city"', () => {
    expect(homeCacheKey({})).toBe('home:v2:general');
    expect(homeCacheKey({ city: 'رفح' })).toBe('home:v2:رفح');
  });

  it('returns the cached payload without touching the service', async () => {
    (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(full));
    const result = await getCachedHomepage({});
    expect(result).toEqual(full);
    expect(homeService.getHomepage).not.toHaveBeenCalled();
  });

  it('assembles on a miss and stores a complete payload with a TTL', async () => {
    (homeService.getHomepage as jest.Mock).mockResolvedValue(full);
    await getCachedHomepage({ city: 'غزة' });
    expect(redis.set).toHaveBeenCalledWith(
      'home:v2:غزة',
      JSON.stringify(full),
      'EX',
      HOME_CACHE_TTL_SECONDS,
    );
  });

  it('does not cache a degraded payload', async () => {
    (homeService.getHomepage as jest.Mock).mockResolvedValue(degraded);
    await getCachedHomepage({});
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('falls through to the service when Redis reads fail', async () => {
    (redis.get as jest.Mock).mockRejectedValue(new Error('redis down'));
    (homeService.getHomepage as jest.Mock).mockResolvedValue(full);
    await expect(getCachedHomepage({})).resolves.toEqual(full);
  });

  it('still returns the payload when the cache write fails', async () => {
    (redis.set as jest.Mock).mockRejectedValue(new Error('redis down'));
    (homeService.getHomepage as jest.Mock).mockResolvedValue(full);
    await expect(getCachedHomepage({})).resolves.toEqual(full);
  });

  it('shares one in-flight assembly between concurrent misses', async () => {
    let release!: (v: unknown) => void;
    (homeService.getHomepage as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { release = resolve; }),
    );
    const a = getCachedHomepage({ city: 'خان يونس' });
    const b = getCachedHomepage({ city: 'خان يونس' });
    await new Promise((r) => setImmediate(r));
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
