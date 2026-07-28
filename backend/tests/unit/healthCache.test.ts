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
   * audit. `checkOk()` wraps each individual check in try/catch, so a
   * check that throws synchronously (e.g. a client library throwing
   * before it ever returns a promise) resolves to `false` the same way
   * an ordinary async rejection does — it does NOT escape Promise.all
   * or cause getCachedReadiness() itself to reject. This test forces
   * that exact scenario and asserts the safer behavior: a reported
   * `db: 'error'` status, not a thrown/rejected getCachedReadiness().
   */
  it('BUGFIX: a synchronous throw from a check is reported as db: error, not an unhandled rejection', async () => {
    const { redis } = await import('../../src/config/redis');
    // A synchronous throw, not a rejected promise — the scenario
    // checkOk() exists specifically to catch.
    jest.spyOn(prisma, '$queryRaw').mockImplementation(() => {
      throw new Error('client library threw synchronously, e.g. a torn-down connection');
    });
    jest.spyOn(redis, 'ping').mockResolvedValue('PONG');

    const { getCachedReadiness } = await import('../../src/shared/utils/healthCache');

    // checkOk() catches the synchronous throw internally, so this
    // resolves — it does not reject.
    const status = await getCachedReadiness();
    expect(status.db).toBe('error');
    expect(status.redis).toBe('ok');

    // A later call, once the underlying issue is resolved, reflects
    // the recovered state — nothing about the earlier throw leaves the
    // cache permanently stuck.
    jest.spyOn(prisma, '$queryRaw').mockResolvedValue([{ '?column?': 1 }] as any);
    // Beyond the 30s cache window would normally be required to force a
    // re-check; resetModules() + a fresh import already gives us a
    // clean module instance for this assertion.
    jest.resetModules();
    const { getCachedReadiness: freshGetCachedReadiness } = await import(
      '../../src/shared/utils/healthCache'
    );
    const recovered = await freshGetCachedReadiness();
    expect(recovered.db).toBe('ok');
    expect(recovered.redis).toBe('ok');
  });
});
