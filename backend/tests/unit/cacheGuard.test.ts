import {
  CACHE_COMMAND_TIMEOUT_MS,
  CacheTimeoutError,
  guardedCache,
  resetCacheGuard,
  withCacheTimeout,
} from '../../src/shared/utils/cacheGuard';
import { CircuitBreakerOpenError } from '../../src/shared/utils/circuitBreaker';

jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

describe('cacheGuard (FIX REDIS-CACHE-TIMEOUT-01)', () => {
  afterEach(() => {
    resetCacheGuard();
    jest.useRealTimers();
  });

  it('passes through a fast result', async () => {
    await expect(withCacheTimeout(async () => 'ok')).resolves.toBe('ok');
  });

  it('passes through the operation\'s own error', async () => {
    await expect(withCacheTimeout(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
  });

  it('rejects with CacheTimeoutError when the command hangs', async () => {
    jest.useFakeTimers();
    const p = withCacheTimeout(() => new Promise<string>(() => {}));
    const assertion = expect(p).rejects.toBeInstanceOf(CacheTimeoutError);
    await jest.advanceTimersByTimeAsync(CACHE_COMMAND_TIMEOUT_MS + 1);
    await assertion;
  });

  it('opens the breaker after 3 consecutive failures and then skips the command entirely', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('down'));
    for (let i = 0; i < 3; i += 1) {
      await expect(guardedCache(failing)).rejects.toThrow('down');
    }
    expect(failing).toHaveBeenCalledTimes(3);

    await expect(guardedCache(failing)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(failing).toHaveBeenCalledTimes(3); // not called while open
  });

  it('a success resets the failure streak', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('down'));
    await expect(guardedCache(failing)).rejects.toThrow();
    await expect(guardedCache(failing)).rejects.toThrow();
    await expect(guardedCache(async () => 'ok')).resolves.toBe('ok');
    await expect(guardedCache(failing)).rejects.toThrow('down'); // still closed
    await expect(guardedCache(failing)).rejects.toThrow('down');
  });
});
