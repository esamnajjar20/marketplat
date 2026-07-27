import type { redis as RedisModule } from '../../src/config/redis';
import type { logger as LoggerModule } from '../../src/shared/utils/logger';

/**
 * PROD-FIX-11 coverage: redisMemoryMonitor.ts is the piece that turns
 * docker-compose.yml's `maxmemory-policy noeviction` from an
 * unmonitored tradeoff into an observable one. Covers: INFO memory
 * parsing, the Prometheus gauges being set correctly, the 80%
 * threshold warning firing (and NOT firing below it), the 5-minute
 * warning cooldown, the unbounded-maxmemory (0) edge case, and a
 * failed INFO call not throwing.
 *
 * Each test re-imports the module fresh (jest.resetModules) because
 * redisMemoryMonitor keeps pollTimer/lastWarnedAt in module-level
 * closure variables with no exported reset function, same reasoning
 * as healthCache.test.ts's own header comment.
 *
 * BUGFIX (found during a post-implementation code audit): this file
 * previously imported `redis`/`logger` statically at the top and spied
 * on those references. But jest.resetModules() + a dynamic
 * `await import('.../redisMemoryMonitor')` gives redisMemoryMonitor.ts
 * a DIFFERENT instance of config/redis's and logger.ts's mocks each
 * time (neither has a globalThis singleton guard the way
 * config/prisma.ts does) — so every spy set up via the static imports
 * was silently spying on an instance redisMemoryMonitor never actually
 * used internally. Every test below now re-imports both dynamically,
 * in the same generation as the module under test.
 */
describe('redisMemoryMonitor', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  async function freshMocks() {
    const { redis } = await import('../../src/config/redis');
    const { logger } = await import('../../src/shared/utils/logger');
    jest.spyOn(logger, 'warn').mockImplementation(() => logger as unknown as ReturnType<typeof logger.warn>);
    jest.spyOn(logger, 'info').mockImplementation(() => logger as unknown as ReturnType<typeof logger.info>);
    jest.spyOn(logger, 'error').mockImplementation(() => logger as unknown as ReturnType<typeof logger.error>);
    return { redis, logger };
  }

  function mockInfo(redis: typeof RedisModule, usedBytes: number, maxBytes: number) {
    jest.spyOn(redis, 'info').mockResolvedValue(`used_memory:${usedBytes}\r\nmaxmemory:${maxBytes}\r\n`);
  }

  it('sets both gauges from a successful INFO memory poll', async () => {
    const { redis } = await freshMocks();
    mockInfo(redis, 500_000_000, 1_000_000_000);

    const { redisMemoryMonitor, redisMemoryUsedBytes, redisMemoryMaxBytes } = await import(
      '../../src/shared/utils/redisMemoryMonitor'
    );

    redisMemoryMonitor.start();
    // start() polls once synchronously-fired (void pollOnce()) — flush
    // the microtask queue so that poll has actually completed before
    // asserting on the gauges it sets.
    await Promise.resolve();
    await Promise.resolve();

    expect((await redisMemoryUsedBytes.get()).values[0].value).toBe(500_000_000);
    expect((await redisMemoryMaxBytes.get()).values[0].value).toBe(1_000_000_000);

    redisMemoryMonitor.stop();
  });

  it('does not warn when usage is below the 80% threshold', async () => {
    const { redis, logger } = await freshMocks();
    mockInfo(redis, 700_000_000, 1_000_000_000); // 70%

    const { redisMemoryMonitor } = await import('../../src/shared/utils/redisMemoryMonitor');
    redisMemoryMonitor.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(logger.warn).not.toHaveBeenCalled();
    redisMemoryMonitor.stop();
  });

  it('warns when usage crosses the 80% threshold', async () => {
    const { redis, logger } = await freshMocks();
    mockInfo(redis, 850_000_000, 1_000_000_000); // 85%

    const { redisMemoryMonitor } = await import('../../src/shared/utils/redisMemoryMonitor');
    redisMemoryMonitor.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Redis memory usage'),
      expect.objectContaining({ usedBytes: 850_000_000, maxBytes: 1_000_000_000 }),
    );
    redisMemoryMonitor.stop();
  });

  it('does not warn again within the 5-minute cooldown, even if still over threshold', async () => {
    jest.useFakeTimers();
    const { redis, logger } = await freshMocks();
    mockInfo(redis, 900_000_000, 1_000_000_000); // 90%, well over threshold on every poll

    const { redisMemoryMonitor } = await import('../../src/shared/utils/redisMemoryMonitor');
    redisMemoryMonitor.start();
    await jest.advanceTimersByTimeAsync(0); // flush the immediate poll

    expect(logger.warn).toHaveBeenCalledTimes(1);

    // Advance through several poll intervals, still within the 5-minute cooldown.
    await jest.advanceTimersByTimeAsync(30_000);
    await jest.advanceTimersByTimeAsync(30_000);
    await jest.advanceTimersByTimeAsync(30_000);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    redisMemoryMonitor.stop();
  });

  it('warns again after the 5-minute cooldown elapses, if still over threshold', async () => {
    jest.useFakeTimers();
    const { redis, logger } = await freshMocks();
    mockInfo(redis, 900_000_000, 1_000_000_000);

    const { redisMemoryMonitor } = await import('../../src/shared/utils/redisMemoryMonitor');
    redisMemoryMonitor.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(logger.warn).toHaveBeenCalledTimes(1);

    // Past the 5-minute (300_000ms) cooldown.
    await jest.advanceTimersByTimeAsync(300_001);

    expect(logger.warn).toHaveBeenCalledTimes(2);
    redisMemoryMonitor.stop();
  });

  it('does not warn when maxmemory is 0 (unbounded) regardless of used_memory', async () => {
    const { redis, logger } = await freshMocks();
    mockInfo(redis, 5_000_000_000, 0);

    const { redisMemoryMonitor } = await import('../../src/shared/utils/redisMemoryMonitor');
    redisMemoryMonitor.start();
    await Promise.resolve();
    await Promise.resolve();

    expect(logger.warn).not.toHaveBeenCalled();
    redisMemoryMonitor.stop();
  });

  it('logs an error but does not throw when the INFO call itself fails', async () => {
    const { redis, logger } = await freshMocks();
    jest.spyOn(redis, 'info').mockRejectedValue(new Error('connection reset'));

    const { redisMemoryMonitor } = await import('../../src/shared/utils/redisMemoryMonitor');
    expect(() => redisMemoryMonitor.start()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(logger.error).toHaveBeenCalledWith('Redis memory monitor poll failed', expect.any(Error));
    redisMemoryMonitor.stop();
  });

  it('start() is idempotent — calling it twice does not create two poll timers', async () => {
    jest.useFakeTimers();
    const { redis } = await freshMocks();
    mockInfo(redis, 100, 1_000_000_000);
    const infoMock = jest.spyOn(redis, 'info');

    const { redisMemoryMonitor } = await import('../../src/shared/utils/redisMemoryMonitor');
    redisMemoryMonitor.start();
    redisMemoryMonitor.start(); // second call should be a no-op

    await jest.advanceTimersByTimeAsync(0);
    // Exactly one immediate poll from the first start() call, not two.
    expect(infoMock).toHaveBeenCalledTimes(1);

    redisMemoryMonitor.stop();
  });
});
