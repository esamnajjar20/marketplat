import type { Prisma, PrismaClient } from '@prisma/client';
import {
  executeWithGoFallback,
  runAdvisoryLockedBatch,
} from './executeWithFallback';
import { logger } from '../utils/logger';

interface TransactionalJobOptions<TResult> {
  jobName: string;
  path: `/internal/${string}`;
  lockId: bigint;
  body?: Record<string, unknown>;
  validateResult: (value: unknown) => value is TResult;
  runExpressFallback: (tx: Prisma.TransactionClient) => Promise<unknown>;
  /** Post-commit side effects for a Go result; must never rerun the DB job. */
  onGoSuccess?: (result: TResult) => void | Promise<void>;
  /** Same post-commit effects for an Express fallback result. */
  onExpressFallbackSuccess?: (result: unknown) => void | Promise<void>;
  timeoutMs?: number;
  transactionTimeoutMs?: number;
}

/** Write-capable job coordinator: Go first, then the same SQL fallback under
 * the identical transaction-scoped advisory lock. This is safe after an HTTP
 * timeout because the fallback cannot overlap a still-running Go session lock.
 */
export async function executeTransactionalJobWithGoFallback<TResult>(
  prisma: PrismaClient,
  options: TransactionalJobOptions<TResult>
): Promise<void> {
  await executeWithGoFallback<TResult>({
    jobName: options.jobName,
    path: options.path,
    body: options.body ?? {},
    validateResult: options.validateResult,
    onGoSuccess: options.onGoSuccess,
    timeoutMs: options.timeoutMs ?? 100_000,
    runExpressFallback: async () => {
      const result = await runAdvisoryLockedBatch(
        prisma,
        options.lockId,
        options.runExpressFallback,
        {
          maxWaitMs: 5_000,
          transactionTimeoutMs: options.transactionTimeoutMs ?? 90_000,
        }
      );
      if (!result.acquired) return 'busy';
      if (options.onExpressFallbackSuccess) {
        try {
          await options.onExpressFallbackSuccess(result.value);
        } catch (error) {
          logger.error(`[${options.jobName}] Express post-commit hook failed; database job remains completed`, {
            errorType: error instanceof Error ? error.name : 'unknown',
          });
        }
      }
      return 'completed';
    },
  });
}
