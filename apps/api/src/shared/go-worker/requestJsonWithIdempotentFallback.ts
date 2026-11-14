import { logger } from '../observability/logger';
import { getGoWorkerBaseUrl, getGoWorkerToken } from './goWorkerConfig';

type RequestJsonWithIdempotentFallbackOptions<TResult> = {
  jobName: string;
  path: `/internal/${string}`;
  body: Record<string, unknown>;
  /** Stable for every retry/fallback of the same logical write. */
  idempotencyKey: string;
  validateResult: (value: unknown) => value is TResult;
  runExpressFallback: () => Promise<TResult>;
  timeoutMs?: number;
};

/**
 * Sends an idempotent write to Go first and executes the Express fallback if
 * Go is unavailable, rejects the request, or returns an invalid response.
 * The caller MUST enforce idempotency at the durable write boundary (for
 * example, by inserting stable event IDs under a unique database constraint).
 * This helper never replays the Go request; it only invokes the fallback once.
 */
export async function requestJsonWithGoIdempotentFallback<TResult>(
  options: RequestJsonWithIdempotentFallbackOptions<TResult>
): Promise<TResult> {
  const idempotencyKey = options.idempotencyKey.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) {
    throw new Error('A non-empty idempotency key of at most 200 characters is required');
  }

  const baseUrl = getGoWorkerBaseUrl();
  const token = getGoWorkerToken();

  if (baseUrl && token) {
    try {
      const response = await fetch(`${baseUrl}${options.path}`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 1_500),
      });

      if (response.ok) {
        let result: unknown;
        try {
          result = await response.json();
        } catch {
          result = undefined;
        }
        if (options.validateResult(result)) {
          logger.info(`[${options.jobName}] Go worker completed idempotent write`);
          return result;
        }
        logger.warn(`[${options.jobName}] Go worker returned an invalid write response; using Express fallback`);
      } else {
        // Do not leave an unread response body occupying a pooled connection.
        await response.body?.cancel().catch(() => undefined);
        logger.warn(`[${options.jobName}] Go worker rejected write; using Express fallback`, {
          status: response.status,
        });
      }
    } catch (error) {
      logger.warn(`[${options.jobName}] Go worker unavailable for write; using Express fallback`, {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
  } else {
    logger.info(`[${options.jobName}] Go worker is not configured; using Express fallback`);
  }

  return options.runExpressFallback();
}
