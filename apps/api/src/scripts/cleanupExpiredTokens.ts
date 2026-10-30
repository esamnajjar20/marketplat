/**
 * Deletes unusable authentication tokens in bounded batches.
 * Password-reset tokens preserve the expired OR used policy. Email-verification
 * tokens are retained until expiry, including used tokens, as a short-lived
 * audit trail.
 */
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { logger } from '../shared/utils/logger';
import {
  executeWithGoFallback,
  runAdvisoryLockedBatch,
} from '../shared/go-worker/executeWithFallback';

const prisma = new PrismaClient();
const BATCH_SIZE = 500;
// Must match authTokenRetentionLockID in apps/go-worker/cmd/server/main.go.
const AUTH_TOKEN_RETENTION_LOCK_ID = 731904282n;

type AuthTokenRetentionResult = {
  deleted: number;
  batches: number;
  passwordResetDeleted: number;
  emailVerificationDeleted: number;
};

function isAuthTokenRetentionResult(value: unknown): value is AuthTokenRetentionResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return [
    result.deleted,
    result.batches,
    result.passwordResetDeleted,
    result.emailVerificationDeleted,
  ].every(value => Number.isSafeInteger(value) && (value as number) >= 0);
}

async function deletePasswordResetBatch(tx: Prisma.TransactionClient, now: Date): Promise<number> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    WITH doomed AS (
      SELECT id
      FROM "password_reset_tokens"
      WHERE "expiresAt" < ${now} OR "used" = TRUE
      ORDER BY "expiresAt" ASC, id ASC
      LIMIT ${BATCH_SIZE}
    )
    DELETE FROM "password_reset_tokens" AS t
    USING doomed
    WHERE t.id = doomed.id
    RETURNING t.id
  `;
  return rows.length;
}

async function deleteEmailVerificationBatch(tx: Prisma.TransactionClient, now: Date): Promise<number> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    WITH doomed AS (
      SELECT id
      FROM "email_verification_tokens"
      WHERE "expiresAt" < ${now}
      ORDER BY "expiresAt" ASC, id ASC
      LIMIT ${BATCH_SIZE}
    )
    DELETE FROM "email_verification_tokens" AS t
    USING doomed
    WHERE t.id = doomed.id
    RETURNING t.id
  `;
  return rows.length;
}

async function runExpressFallback(): Promise<'completed' | 'busy'> {
  const now = new Date();
  let deleted = 0;
  let batches = 0;
  let passwordResetDeleted = 0;
  let emailVerificationDeleted = 0;

  for (;;) {
    const batch = await runAdvisoryLockedBatch(prisma, AUTH_TOKEN_RETENTION_LOCK_ID, async tx => {
      const passwordResetCount = await deletePasswordResetBatch(tx, now);
      const emailVerificationCount = await deleteEmailVerificationBatch(tx, now);
      return { passwordResetCount, emailVerificationCount };
    });

    if (!batch.acquired) {
      logger.info('[auth-token-retention] Express fallback skipped because another runner owns the advisory lock', {
        deleted,
        batches,
      });
      return 'busy';
    }

    passwordResetDeleted += batch.value.passwordResetCount;
    emailVerificationDeleted += batch.value.emailVerificationCount;
    deleted += batch.value.passwordResetCount + batch.value.emailVerificationCount;
    if (batch.value.passwordResetCount > 0) batches += 1;
    if (batch.value.emailVerificationCount > 0) batches += 1;

    if (
      batch.value.passwordResetCount < BATCH_SIZE &&
      batch.value.emailVerificationCount < BATCH_SIZE
    ) break;
  }

  logger.info('[auth-token-retention] Express fallback completed', {
    deleted,
    batches,
    passwordResetDeleted,
    emailVerificationDeleted,
    at: now.toISOString(),
  });
  return 'completed';
}

async function main(): Promise<void> {
  await executeWithGoFallback<AuthTokenRetentionResult>({
    jobName: 'auth-token-retention',
    path: '/internal/jobs/auth-token-retention',
    body: {},
    validateResult: isAuthTokenRetentionResult,
    runExpressFallback,
  });
}

main()
  .catch(error => {
    logger.error('cleanupExpiredTokens failed', { err: error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
