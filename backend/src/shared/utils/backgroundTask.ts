import { logger } from './logger';
import { recordFailedTask } from './failedBackgroundTasks';

export interface BackgroundTaskOptions {
  /** Durable task type used if all attempts fail. */
  taskType?: string;
  /** Minimal, retry-safe data needed to diagnose/replay the task. Never put secrets here. */
  payload?: Record<string, unknown>;
  /** Number of retries after the initial attempt. */
  retries?: number;
  /** Initial backoff before the first retry. */
  backoffMs?: number;
  /** Upper bound for one retry delay. */
  maxBackoffMs?: number;
  /** Override the transient-error classifier for a specific task. */
  isRetryable?: (error: unknown) => boolean;
}

function errorDetails(error: unknown): { message: string; stack?: string; code?: string; status?: number } {
  if (error instanceof Error) {
    const value = error as Error & { code?: unknown; status?: unknown; statusCode?: unknown };
    return {
      message: value.message,
      stack: value.stack,
      code: typeof value.code === 'string' ? value.code : undefined,
      status: typeof value.status === 'number' ? value.status : typeof value.statusCode === 'number' ? value.statusCode : undefined,
    };
  }
  return { message: String(error) };
}

/**
 * Conservative transient-error policy for background work. Unknown errors are
 * NOT retried automatically: callers can opt into a custom classifier when a
 * task has a stronger idempotency/retry contract.
 */
export function isTransientBackgroundError(error: unknown): boolean {
  const details = errorDetails(error);
  if (typeof details.status === 'number') {
    return details.status === 408 || details.status === 429 || details.status >= 500;
  }
  return new Set([
    'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN',
    'ENETUNREACH', 'EHOSTUNREACH', 'P1001', 'P1002', 'P1008', 'P1017',
  ]).has(details.code ?? '');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs non-critical work outside the request transaction with bounded retries.
 * On final failure it persists a durable FailedBackgroundTask record when a
 * taskType is supplied. The helper itself never throws after exhausting the
 * background contract, so callers can safely use `void runBackgroundTask(...)`.
 */
export async function runBackgroundTask<T>(
  context: string,
  task: () => Promise<T>,
  options: BackgroundTaskOptions = {},
): Promise<T | undefined> {
  const retries = Math.max(0, Math.min(5, Math.trunc(options.retries ?? 2)));
  const baseDelay = Math.max(100, Math.trunc(options.backoffMs ?? 750));
  const maxDelay = Math.max(baseDelay, Math.trunc(options.maxBackoffMs ?? 8_000));
  const retryable = options.isRetryable ?? isTransientBackgroundError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      const details = errorDetails(error);
      const finalAttempt = attempt >= retries || !retryable(error);
      logger.warn('Background task attempt failed', {
        context,
        attempt: attempt + 1,
        maxAttempts: retries + 1,
        final: finalAttempt,
        message: details.message,
        code: details.code,
        status: details.status,
      });

      if (finalAttempt) {
        if (options.taskType) {
          await recordFailedTask(options.taskType, {
            context,
            ...(options.payload ?? {}),
          }, error);
        }
        return undefined;
      }

      const exponential = Math.min(maxDelay, baseDelay * 2 ** attempt);
      const jitter = 0.75 + Math.random() * 0.5;
      await delay(Math.round(exponential * jitter));
    }
  }
  return undefined;
}

/**
 * Reports a best-effort/background task failure without allowing the
 * secondary error path to change the caller's control flow.
 */
export function reportBackgroundFailure(
  context: string,
  error: unknown,
  meta?: Record<string, unknown>,
): void {
  const normalized = errorDetails(error);
  logger.warn('Background task failed', {
    context,
    ...normalized,
    ...meta,
  });
}
