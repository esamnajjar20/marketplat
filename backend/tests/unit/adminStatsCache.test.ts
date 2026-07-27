import { adminStatsCache, AdminStats } from '../../src/shared/utils/adminStatsCache';
import { redis } from '../../src/config/redis';
import { logger } from '../../src/shared/utils/logger';

/**
 * FIX E2E-GAP-01 (test coverage gap identified in the audit): this
 * module was only ever exercised indirectly through
 * admin.service.test.ts's getStats tests — which cover cache-hit and
 * cache-miss, but never the failure paths this file's own try/catch
 * blocks exist specifically to handle. If get()/set()/invalidate()
 * silently stopped catching Redis errors, nothing would have failed.
 */
describe('adminStatsCache', () => {
  const sampleStats: AdminStats = {
    totalAds: 10,
    activeAds: 8,
    totalUsers: 5,
    activeUsers: 4,
    openReports: 1,
    viewsToday: 42,
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('get', () => {
    it('returns null when nothing is cached', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(null);

      const result = await adminStatsCache.get();

      expect(result).toBeNull();
    });

    it('returns the parsed stats when a value is cached', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue(JSON.stringify(sampleStats));

      const result = await adminStatsCache.get();

      expect(result).toEqual(sampleStats);
    });

    it('reads from the fixed "admin_stats_cache" key', async () => {
      const getSpy = jest.spyOn(redis, 'get').mockResolvedValue(null);

      await adminStatsCache.get();

      expect(getSpy).toHaveBeenCalledWith('admin_stats_cache');
    });

    // The gap this fix closes: redis.get() throwing was never tested.
    it('returns null (not a rejected promise) when Redis rejects, and logs the error', async () => {
      jest.spyOn(redis, 'get').mockRejectedValue(new Error('ECONNREFUSED'));
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

      const result = await adminStatsCache.get();

      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith('adminStatsCache.get failed', expect.any(Error));
    });

    it('returns null rather than throwing when the cached value is corrupted (invalid JSON)', async () => {
      jest.spyOn(redis, 'get').mockResolvedValue('{not-valid-json');
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

      const result = await adminStatsCache.get();

      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('writes the stats as JSON with a 30-second TTL', async () => {
      const setexSpy = jest.spyOn(redis, 'setex').mockResolvedValue('OK');

      await adminStatsCache.set(sampleStats);

      expect(setexSpy).toHaveBeenCalledWith('admin_stats_cache', 30, JSON.stringify(sampleStats));
    });

    // The gap this fix closes: a write failure must not propagate —
    // the caller (adminService.getStats) already has fresh data to
    // return regardless of whether caching it succeeds.
    it('does not throw when Redis rejects the write, and logs the error', async () => {
      jest.spyOn(redis, 'setex').mockRejectedValue(new Error('ECONNREFUSED'));
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

      await expect(adminStatsCache.set(sampleStats)).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith('adminStatsCache.set failed', expect.any(Error));
    });
  });

  describe('invalidate', () => {
    it('deletes the fixed cache key', async () => {
      const delSpy = jest.spyOn(redis, 'del').mockResolvedValue(1);

      await adminStatsCache.invalidate();

      expect(delSpy).toHaveBeenCalledWith('admin_stats_cache');
    });

    it('does not throw when Redis rejects the delete, and logs the error', async () => {
      jest.spyOn(redis, 'del').mockRejectedValue(new Error('ECONNREFUSED'));
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => logger);

      await expect(adminStatsCache.invalidate()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledWith('adminStatsCache.invalidate failed', expect.any(Error));
    });
  });
});
