import { prisma } from '../../src/config/prisma';

/**
 * Coverage for healthCache.ts — backs the /ready endpoint. Two pieces
 * of non-trivial logic here:
 *   1. A 30s in-memory cache so a flood of orchestrator probes
 *      (Kubernetes hits this every few seconds) doesn't hammer
 *      Postgres/Redis on every single request.
 *   2. In-flight promise deduplication so concurrent callers within the
 *      same "cache miss" window share one underlying check instead of
 *      each firing their own DB + Redis round trip.
 *
 * Each test re-imports the module fresh (jest.resetModules) because
 * healthCache.ts keeps its cache in module-level closure variables with
 * no exported reset function — the only way to get a clean slate
 * between tests is a fresh module instance.
 */
describe('healthCache', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  it('returns ok/ok when both DB and Redis checks succeed', async () => {
    const { redis } = await import('../../src/config/redis');
    jest.spyOn(prisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }] as any);
    jest.spyOn(redis, 'ping').mockResolvedValue('PONG');

    const { getCachedReadiness } = await import('../../src/shared/utils/healthCache');
    const status = await getCachedReadiness();

    expect(status.db).toBe('ok');
    expect(status.redis).toBe('ok');
    expect(status.checkedAt).toEqual(expect.any(String));
  });

  it('reports db: error when the Postgres query rejects, without affecting the redis result', async () => {
    const { redis } = await import('../../src/config/redis');
    jest.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('connection refused'));
    jest.spyOn(redis, 'ping').mockResolvedValue('PONG');

    const { getCachedReadiness } = await import('../../src/shared/utils/healthCache');
    const status = await getCachedReadiness();

    expect(status.db).toBe('error');
    expect(status.redis).toBe('ok');
  });

  it('reports redis: error when ping rejects, without affecting the db result', async () => {
    const { redis } = await import('../../src/config/redis');
    jest.spyOn(prisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }] as any);
    jest.spyOn(redis, 'ping').mockRejectedValue(new Error('redis unreachable'));

    const { getCachedReadiness } = await import('../../src/shared/utils/healthCache');
    const status = await getCachedReadiness();

    expect(status.db).toBe('ok');
    expect(status.redis).toBe('error');
  });

  it('serves a cached result on the second call within the 30s window — no second DB/Redis hit', async () => {
    const { redis } = await import('../../src/config/redis');
    const queryRawSpy = jest.spyOn(prisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }] as any);
    const pingSpy = jest.spyOn(redis, 'ping').mockResolvedValue('PONG');

    const { getCachedReadiness } = await import('../../src/shared/utils/healthCache');

    const first = await getCachedReadiness();
    const second = await getCachedReadiness();

    expect(second).toEqual(first);
    expect(queryRawSpy).toHaveBeenCalledTimes(1);
    expect(pingSpy).toHaveBeenCalledTimes(1);
  });

  it('re-checks after the 30s cache window has elapsed', async () => {
    const { redis } = await import('../../src/config/redis');
    const queryRawSpy = jest.spyOn(prisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }] as any);
    const pingSpy = jest.spyOn(redis, 'ping').mockResolvedValue('PONG');

    const { getCachedReadiness } = await import('../../src/shared/utils/healthCache');

    const realNow = Date.now;
    let now = realNow();
    jest.spyOn(Date, 'now').mockImplementation(() => now);

    await getCachedReadiness();
    expect(queryRawSpy).toHaveBeenCalledTimes(1);

    // Advance past the 30_000ms cache window.
    now += 30_001;
    await getCachedReadiness();

    expect(queryRawSpy).toHaveBeenCalledTimes(2);
    expect(pingSpy).toHaveBeenCalledTimes(2);
  });

  it('deduplicates concurrent calls into a single underlying check (promise dedup)', async () => {
    const { redis } = await import('../../src/config/redis');
    let resolveQuery: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveQuery = resolve;
    });
    const queryRawSpy = jest.spyOn(prisma, '$queryRaw').mockReturnValue(pending as any);
    const pingSpy = jest.spyOn(redis, 'ping').mockResolvedValue('PONG');

    const { getCachedReadiness } = await import('../../src/shared/utils/healthCache');

    // Fire two concurrent calls before the first DB query has resolved.
    const call1 = getCachedReadiness();
    const call2 = getCachedReadiness();

    resolveQuery!([{ '?column?': 1 }]);

    const [result1, result2] = await Promise.all([call1, call2]);

    expect(result1).toEqual(result2);
    // Only one underlying DB/Redis check should have been performed for
    // both concurrent callers.
    expect(queryRawSpy).toHaveBeenCalledTimes(1);
    expect(pingSpy).toHaveBeenCalledTimes(1);
  });

  /**
   * BUGFIX regression test — found during a post-implementation code
   * audit. Previously `inflightCheck = null` only ran on the success
   * path (right before `return`), not in a `finally`. In real usage
   * performCheck() never actually rejects (every real failure source is
   * already caught internally by the two `.catch(() => false)` calls
   * around the Promise.all), so this couldn't be triggered through the
   * normal DB-down/Redis-down paths — this test forces the scenario
   * directly by making Promise.all itself reject (simulating some
   * future code path between the check and the return that could throw),
   * to prove getCachedReadiness() recovers on the next call rather than
   * permanently serving a stuck rejected Promise.
   */
  it('BUGFIX: recovers on the next call even if a check rejects unexpectedly (not just returns error status)', async () => {
    const { redis } = await import('../../src/config/redis');
    // Force Promise.all itself to reject, not just resolve to false —
    // this is the "escapes the internal .catch()" scenario the fix
    // guards against.
    jest.spyOn(prisma, '$queryRaw').mockImplementation(() => {
      throw new Error('unexpected synchronous throw, bypassing the .catch() chain');
    });
    jest.spyOn(redis, 'ping').mockResolvedValue('PONG');

    const { getCachedReadiness } = await import('../../src/shared/utils/healthCache');

    // First call: the underlying check throws synchronously, so
    // getCachedReadiness() itself rejects.
    await expect(getCachedReadiness()).rejects.toThrow();

    // Without the fix, inflightCheck would still be pointing at that
    // same rejected Promise here — every subsequent call would reuse
    // and re-reject with it forever, even after the underlying issue
    // is fixed. With the fix (finally-based reset), a second call
    // starts a fresh check instead of reusing the stuck one.
    jest.spyOn(prisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }] as any);
    const status = await getCachedReadiness();

    expect(status.db).toBe('ok');
    expect(status.redis).toBe('ok');
  });
});
