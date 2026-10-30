import type { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

export type GoWorkerOutcome = 'go' | 'express' | 'busy';

export interface ExecuteWithGoFallbackOptions<TResult> {
  /** Stable, low-cardinality job name used only for operational logs. */
  jobName: string;
  /** Internal Go worker route, beginning with `/`. */
  path: string;
  /** JSON payload sent to Go. */
  body: Record<string, unknown>;
  /** Reject malformed 2xx responses instead of treating them as completion. */
  validateResult: (value: unknown) => value is TResult;
  /** Must use the same PostgreSQL advisory lock as the Go implementation. */
  runExpressFallback: () => Promise<'completed' | 'busy'>;
  timeoutMs?: number;
}

/**
 * Run a job on Go first, then fall back to Express when Go is unavailable or
 * fails. A Go 409 is deliberately treated as `busy`, not as a fallback signal:
 * it means another runner owns the shared advisory lock and is already working.
 *
 * Every Express fallback must also acquire that same advisory lock (through
 * runAdvisoryLockedBatch below). This is what makes timeout/network ambiguity
 * safe: an HTTP timeout does not prove that the remote worker stopped.
 */
export async function executeWithGoFallback<TResult>(
  options: ExecuteWithGoFallbackOptions<TResult>
): Promise<GoWorkerOutcome> {
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
        },
        body: JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 9 * 60 * 1_000),
      });

      if (response.status === 409) {
        logger.info(`[${options.jobName}] Go worker reports job already running; duplicate skipped`);
        return 'busy';
      }

      if (response.ok) {
        let result: unknown;
        try {
          result = await response.json();
        } catch {
          result = undefined;
        }

        if (options.validateResult(result)) {
          logger.info(`[${options.jobName}] Go worker completed`, result);
          return 'go';
        }

        logger.warn(`[${options.jobName}] Go worker returned an invalid success payload; using Express fallback`);
      } else {
        // A non-409 response is not proof that Go did not partially execute.
        // The Express fallback's shared advisory lock is the final safety gate.
        logger.warn(`[${options.jobName}] Go worker returned a failure; using Express fallback`, {
          status: response.status,
        });
      }
    } catch (error) {
      // Never include the worker URL, Authorization header, or token in logs.
      logger.warn(`[${options.jobName}] Go worker unavailable; using Express fallback`, {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
  } else {
    logger.info(`[${options.jobName}] Go worker is not configured; using Express fallback`);
  }

  const fallbackOutcome = await options.runExpressFallback();
  return fallbackOutcome === 'busy' ? 'busy' : 'express';
}

export type AdvisoryBatchResult<T> =
  | { acquired: false }
  | { acquired: true; value: T };

/**
 * Execute exactly one bounded Express fallback batch while holding a
 * transaction-scoped advisory lock. The numeric key MUST match the Go
 * handler's session-scoped pg_try_advisory_lock key for the same job.
 *
 * Locking one batch per transaction avoids a long-running Prisma transaction
 * while still preventing a timed-out Go request and Express from overlapping.
 */
export async function runAdvisoryLockedBatch<T>(
  prisma: PrismaClient,
  lockId: bigint,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { maxWaitMs?: number; transactionTimeoutMs?: number } = {}
): Promise<AdvisoryBatchResult<T>> {
  return prisma.$transaction(
    async tx => {
      const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_try_advisory_xact_lock(${lockId}::bigint) AS locked
      `;
      if (!rows[0]?.locked) return { acquired: false } as const;
      return { acquired: true, value: await operation(tx) } as const;
    },
    {
      maxWait: options.maxWaitMs ?? 5_000,
      timeout: options.transactionTimeoutMs ?? 20_000,
    }
  );
}
