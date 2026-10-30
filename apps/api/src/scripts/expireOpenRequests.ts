import { prisma } from '../config/prisma';
import { logger } from '../shared/utils/logger';
import {
  executeWithGoFallback,
  runAdvisoryLockedBatch,
} from '../shared/go-worker/executeWithFallback';

const BATCH_SIZE = 1_000;
// Must match openRequestExpiryLockID in apps/go-worker/cmd/server/main.go.
const OPEN_REQUEST_EXPIRY_LOCK_ID = 731904296n;

type RequestExpiryResult = {
  expired: number;
  batches: number;
  evaluatedAt: string;
};

function isRequestExpiryResult(value: unknown): value is RequestExpiryResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(result.expired) && (result.expired as number) >= 0 &&
    Number.isSafeInteger(result.batches) && (result.batches as number) >= 0 &&
    typeof result.evaluatedAt === 'string' && Number.isFinite(Date.parse(result.evaluatedAt))
  );
}

async function runExpressFallback(): Promise<'completed' | 'busy'> {
  const now = new Date();
  let expired = 0;
  let batches = 0;

  for (;;) {
    const batch = await runAdvisoryLockedBatch(prisma, OPEN_REQUEST_EXPIRY_LOCK_ID, async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>`
        WITH due AS (
          SELECT id
          FROM "requests"
          WHERE "status" = 'OPEN'
            AND "expiresAt" IS NOT NULL
            AND "expiresAt" <= ${now}
          ORDER BY "expiresAt" ASC, id ASC
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "requests" AS request
        SET "status" = 'EXPIRED', "updatedAt" = ${now}
        FROM due
        WHERE request.id = due.id
          AND request."status" = 'OPEN'
        RETURNING request.id
      `;
      return rows.length;
    }, { transactionTimeoutMs: 20_000 });

    if (!batch.acquired) {
      logger.info('[expire-open-requests] Express fallback skipped because another runner owns the advisory lock', {
        expired,
        batches,
      });
      return 'busy';
    }

    expired += batch.value;
    if (batch.value > 0) batches += 1;
    if (batch.value < BATCH_SIZE) break;
  }

  logger.info('[expire-open-requests] Express fallback completed', {
    expired,
    batches,
    evaluatedAt: now.toISOString(),
  });
  return 'completed';
}

async function main(): Promise<void> {
  await executeWithGoFallback<RequestExpiryResult>({
    jobName: 'expire-open-requests',
    path: '/internal/jobs/expire-open-requests',
    body: {},
    validateResult: isRequestExpiryResult,
    runExpressFallback,
  });
}

main()
  .catch(error => {
    logger.error('[expire-open-requests] job failed', { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
