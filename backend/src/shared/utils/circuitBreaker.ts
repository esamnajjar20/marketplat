import { logger } from './logger';

/**
 * PROD-FIX-12: a minimal, dependency-free circuit breaker.
 *
 * Why hand-rolled instead of a library (e.g. opossum): this repo has
 * no network access to install new npm packages in the environment
 * these fixes were written in, and a circuit breaker's core logic is
 * genuinely small — a state machine with three states and a handful of
 * counters. Pulling in a library for ~120 lines of well-understood
 * logic that the team can read and modify directly is a reasonable
 * tradeoff for a project this size; if opossum or a similar library is
 * later added for other reasons (more sophisticated metrics, bucketed
 * rolling windows, etc.), this can be swapped out without changing any
 * call site — every call site depends only on the CircuitBreaker
 * interface below, not this specific implementation.
 *
 * States:
 *   CLOSED    — normal operation, every call goes through.
 *   OPEN      — the wrapped function is failing too often; calls are
 *               rejected immediately (without even attempting the real
 *               operation) until resetTimeoutMs has elapsed.
 *   HALF_OPEN — after resetTimeoutMs, the next call is allowed through
 *               as a "trial" — success closes the circuit again,
 *               failure re-opens it (and restarts the timeout).
 *
 * This does NOT replace the per-call timeouts already added in
 * config/cloudinary.ts and emailService.ts (PROD-FIX-02) — those bound
 * how long a SINGLE call can hang; this bounds how many FAILING calls
 * in a row get attempted at all before backing off, protecting against
 * a sustained outage burning through connections/threads on every
 * single request rather than failing fast once the pattern is clear.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreakerOpenError extends Error {
  constructor(name: string) {
    super(`Circuit breaker "${name}" is OPEN — refusing call without attempting it`);
    this.name = 'CircuitBreakerOpenError';
  }
}

export interface CircuitBreakerOptions {
  /** Human-readable name, used only for logging. */
  name: string;
  /** Consecutive failures required to trip the circuit from CLOSED to OPEN. */
  failureThreshold: number;
  /** How long the circuit stays OPEN before allowing a HALF_OPEN trial call. */
  resetTimeoutMs: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private nextAttemptAt = 0;
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  /**
   * BUGFIX (found during a post-implementation code audit): guards the
   * OPEN -> HALF_OPEN transition against a concurrency race. Without
   * this, two calls to execute() arriving in the same tick after
   * resetTimeoutMs has elapsed would BOTH observe `state === 'OPEN'`
   * and `Date.now() >= nextAttemptAt` (the check + the `this.state =
   * 'HALF_OPEN'` assignment are not atomic across two concurrent async
   * callers), so both would proceed to call fn() — silently
   * contradicting this class's own documented contract ("allow exactly
   * ONE trial call through") and defeating half the point of
   * HALF_OPEN, which exists specifically to probe a recovering
   * dependency with minimal additional load rather than letting a
   * traffic burst immediately re-hammer it the moment the cooldown
   * expires. This flag makes that transition effectively atomic:
   * whichever concurrent caller reaches the check first flips it and
   * proceeds as the trial call; every other caller in the same window
   * sees it already true and is rejected via CircuitBreakerOpenError,
   * exactly like a normal OPEN rejection, until the trial call's own
   * onSuccess()/onFailure() resolves the state one way or the other.
   */
  private halfOpenTrialInFlight = false;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold;
    this.resetTimeoutMs = options.resetTimeoutMs;
  }

  getState(): CircuitState {
    return this.state;
  }

  /**
   * Runs fn() through the breaker. Throws CircuitBreakerOpenError
   * immediately (without calling fn()) if the circuit is OPEN and the
   * reset timeout hasn't elapsed yet. Otherwise calls fn() and updates
   * the breaker's state based on whether it resolves or rejects.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptAt) {
        throw new CircuitBreakerOpenError(this.name);
      }

      // Reset timeout elapsed — allow exactly ONE trial call through.
      // See halfOpenTrialInFlight's own doc comment above for why this
      // check exists: without it, concurrent callers arriving here in
      // the same tick would each independently pass this check and
      // all become "trial calls", not just the first one.
      if (this.halfOpenTrialInFlight) {
        throw new CircuitBreakerOpenError(this.name);
      }

      this.halfOpenTrialInFlight = true;
      this.state = 'HALF_OPEN';
      logger.info(`Circuit breaker "${this.name}" moving to HALF_OPEN — allowing a trial call`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state !== 'CLOSED') {
      logger.info(`Circuit breaker "${this.name}" closing again after a successful trial call`);
    }
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.halfOpenTrialInFlight = false;
  }

  private onFailure(): void {
    this.consecutiveFailures += 1;

    if (this.state === 'HALF_OPEN') {
      // The trial call failed — go straight back to OPEN and restart
      // the timeout, rather than waiting for failureThreshold again.
      this.halfOpenTrialInFlight = false;
      this.trip();
      return;
    }

    if (this.consecutiveFailures >= this.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = 'OPEN';
    this.nextAttemptAt = Date.now() + this.resetTimeoutMs;
    logger.warn(
      `Circuit breaker "${this.name}" OPEN after ${this.consecutiveFailures} consecutive ` +
      `failures — rejecting calls without attempting them for ${this.resetTimeoutMs}ms`,
      { name: this.name, consecutiveFailures: this.consecutiveFailures, resetTimeoutMs: this.resetTimeoutMs },
    );
  }

  /** Test/ops escape hatch — force the circuit back to a known state. */
  reset(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.nextAttemptAt = 0;
    this.halfOpenTrialInFlight = false;
  }
}
