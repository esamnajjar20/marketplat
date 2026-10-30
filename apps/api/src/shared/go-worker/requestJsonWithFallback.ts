import { logger } from '../utils/logger';

type RequestJsonWithFallbackOptions<TResult> = {
  jobName: string;
  path: `/internal/${string}`;
  body: Record<string, unknown>;
  validateResult: (value: unknown) => value is TResult;
  runExpressFallback: () => Promise<TResult>;
  timeoutMs?: number;
};

/**
 * Uses Go for an authenticated, read-only internal workload and falls back to
 * the existing Express implementation when Go is unavailable or its result
 * is invalid. The helper deliberately has no write/retry semantics: callers
 * must use it only for read-only work that is safe to repeat.
 */
export async function requestJsonWithGoFallback<TResult>(
  options: RequestJsonWithFallbackOptions<TResult>
): Promise<TResult> {
  const baseUrl = process.env.GO_WORKER_URL?.trim().replace(/\/+$/, '');
  const token = process.env.GO_WORKER_TOKEN?.trim();

  if (baseUrl && token) {
    try {
      const response = await fetch(`${baseUrl}${options.path}`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 6_000),
      });

      if (response.ok) {
        let result: unknown;
        try {
          result = await response.json();
        } catch {
          result = undefined;
        }
        if (options.validateResult(result)) {
          logger.info(`[${options.jobName}] Go worker completed read workload`);
          return result;
        }
        logger.warn(`[${options.jobName}] Go worker returned an invalid response; using Express fallback`);
      } else {
        logger.warn(`[${options.jobName}] Go worker returned a failure; using Express fallback`, {
          status: response.status,
        });
      }
    } catch (error) {
      logger.warn(`[${options.jobName}] Go worker unavailable; using Express fallback`, {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
  } else {
    logger.info(`[${options.jobName}] Go worker is not configured; using Express fallback`);
  }

  return options.runExpressFallback();
}
