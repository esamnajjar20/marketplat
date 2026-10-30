import type { Prisma, PrismaClient } from '@prisma/client';
import {
  executeWithGoFallback,
  runAdvisoryLockedBatch,
} from './executeWithFallback';

interface TransactionalJobOptions<TResult> {
  jobName: string;
  path: `/internal/${string}`;
  lockId: bigint;
  body?: Record<string, unknown>;
  validateResult: (value: unknown) => value is TResult;
  runExpressFallback: (tx: Prisma.TransactionClient) => Promise<unknown>;
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
      return result.acquired ? 'completed' : 'busy';
    },
  });
}
