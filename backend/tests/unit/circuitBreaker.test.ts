import { CircuitBreaker, CircuitBreakerOpenError } from '../../src/shared/utils/circuitBreaker';
import { logger } from '../../src/shared/utils/logger';

/**
 * PROD-FIX-12 coverage: CircuitBreaker is new, hand-rolled logic (see
 * its own header comment for why no external library was used) — this
 * is the only thing verifying its CLOSED -> OPEN -> HALF_OPEN state
 * machine actually behaves correctly, since config/cloudinary.ts's own
 * integration can't be exercised without a real/mocked Cloudinary
 * account.
 */
describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    jest.spyOn(logger, 'info').mockImplementation(() => logger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeBreaker(overrides: Partial<{ failureThreshold: number; resetTimeoutMs: number }> = {}) {
    return new CircuitBreaker({
      name: 'test-breaker',
      failureThreshold: overrides.failureThreshold ?? 3,
      resetTimeoutMs: overrides.resetTimeoutMs ?? 1000,
    });
  }

  it('starts CLOSED and lets calls through', async () => {
    const breaker = makeBreaker();
    expect(breaker.getState()).toBe('CLOSED');

    const result = await breaker.execute(async () => 'ok');
    expect(result).toBe('ok');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('stays CLOSED after fewer than failureThreshold consecutive failures', async () => {
    const breaker = makeBreaker({ failureThreshold: 3 });

    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');

    expect(breaker.getState()).toBe('CLOSED');
  });

  it('trips to OPEN after failureThreshold consecutive failures', async () => {
    const breaker = makeBreaker({ failureThreshold: 3 });

    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    }

    expect(breaker.getState()).toBe('OPEN');
  });

  it('rejects immediately with CircuitBreakerOpenError while OPEN, without calling fn()', async () => {
    const breaker = makeBreaker({ failureThreshold: 1 });
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('OPEN');

    const fn = jest.fn(async () => 'should not run');
    await expect(breaker.execute(fn)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(fn).not.toHaveBeenCalled();
  });

  it('a successful call resets the consecutive-failure count (does not trip on a mix of successes and failures)', async () => {
    const breaker = makeBreaker({ failureThreshold: 3 });

    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await breaker.execute(async () => 'ok'); // resets consecutiveFailures to 0
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');

    // 4 total failures, but never 3 in a row — should still be CLOSED.
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('moves from OPEN to HALF_OPEN and allows exactly one trial call after resetTimeoutMs elapses', async () => {
    jest.useFakeTimers();
    const breaker = makeBreaker({ failureThreshold: 1, resetTimeoutMs: 5000 });

    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('OPEN');

    // Still within the cooldown — rejected without calling fn().
    const blockedDuringCooldown = jest.fn(async () => 'should not run');
    await expect(breaker.execute(blockedDuringCooldown)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(blockedDuringCooldown).not.toHaveBeenCalled();

    jest.advanceTimersByTime(5001);

    const trialCall = jest.fn(async () => 'trial result');
    const result = await breaker.execute(trialCall);
    expect(trialCall).toHaveBeenCalledTimes(1);
    expect(result).toBe('trial result');
    // A successful trial call closes the circuit again.
    expect(breaker.getState()).toBe('CLOSED');

    jest.useRealTimers();
  });

  /**
   * BUGFIX regression test — found during a post-implementation code
   * audit. Simulates two genuinely concurrent callers arriving in the
   * same JS tick right after resetTimeoutMs elapses, by calling
   * execute() twice back-to-back with NO await between the two calls
   * (unlike every other test in this file, which awaits sequentially —
   * that would never have caught this, since awaiting the first call
   * lets it fully resolve, including flipping the circuit back to
   * CLOSED, before the second call is even made). Both underlying fn()
   * implementations are slow (never resolve during this test) so
   * their execute() promises are still pending — genuinely
   * overlapping — at the moment both are inspected.
   */
  it('BUGFIX: concurrent callers arriving right as the cooldown elapses do not both become trial calls', async () => {
    jest.useFakeTimers();
    const breaker = makeBreaker({ failureThreshold: 1, resetTimeoutMs: 5000 });

    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('OPEN');

    jest.advanceTimersByTime(5001);

    const trialFn1 = jest.fn(() => new Promise<string>(() => {})); // never resolves during this test
    const trialFn2 = jest.fn(() => new Promise<string>(() => {}));

    // No `await` between these two calls — both synchronous portions
    // of execute() (the OPEN/nextAttemptAt/halfOpenTrialInFlight
    // checks) run before either fn() has a chance to resolve,
    // genuinely exercising the concurrent-arrival race.
    const promise1 = breaker.execute(trialFn1);
    const promise2 = breaker.execute(trialFn2);

    // Let any already-queued microtasks (e.g. the rejection path for
    // whichever call loses the race) settle.
    await Promise.resolve();

    expect(trialFn1).toHaveBeenCalledTimes(1);
    // The critical assertion: the second concurrent caller must NOT
    // also have been let through as a trial call.
    expect(trialFn2).not.toHaveBeenCalled();

    // The losing caller's promise must reject immediately with
    // CircuitBreakerOpenError, exactly like a normal OPEN rejection —
    // it should not just hang waiting on the first trial call.
    await expect(promise2).rejects.toBeInstanceOf(CircuitBreakerOpenError);

    // Avoid an unhandled rejection warning from promise1, which never
    // resolves in this test — not part of what's being asserted here.
    void promise1.catch(() => {});

    jest.useRealTimers();
  });

  it('a failed HALF_OPEN trial call re-opens the circuit and restarts the cooldown', async () => {
    jest.useFakeTimers();
    const breaker = makeBreaker({ failureThreshold: 1, resetTimeoutMs: 5000 });

    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('OPEN');

    jest.advanceTimersByTime(5001);

    // The trial call itself fails.
    await expect(breaker.execute(async () => { throw new Error('still broken'); })).rejects.toThrow('still broken');
    expect(breaker.getState()).toBe('OPEN');

    // Cooldown should have restarted — immediately after the failed
    // trial, a new call should still be rejected without running.
    const fn = jest.fn(async () => 'should not run');
    await expect(breaker.execute(fn)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(fn).not.toHaveBeenCalled();

    jest.useRealTimers();
  });

  it('reset() forces the breaker back to CLOSED with a clean failure count', async () => {
    const breaker = makeBreaker({ failureThreshold: 1 });
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    expect(breaker.getState()).toBe('OPEN');

    breaker.reset();
    expect(breaker.getState()).toBe('CLOSED');

    const fn = jest.fn(async () => 'ok');
    await breaker.execute(fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('logs a warning when the circuit trips', async () => {
    const breaker = makeBreaker({ failureThreshold: 1 });
    await expect(breaker.execute(async () => { throw new Error('boom'); })).rejects.toThrow('boom');

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('OPEN'),
      expect.objectContaining({ name: 'test-breaker', consecutiveFailures: 1 }),
    );
  });
});
