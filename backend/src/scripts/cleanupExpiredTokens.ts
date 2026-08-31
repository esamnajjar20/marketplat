/**
 * Deletes password-reset tokens that are expired or already used.
 *
 * Usage:
 *   npm run report:cleanup-tokens
 */
import { PrismaClient } from '@prisma/client';
import { logger } from '../shared/utils/logger';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const now = new Date();
  const result = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { used: true }],
    },
  });
  logger.info('cleanupExpiredTokens finished', {
    deleted: result.count,
    at: now.toISOString(),
  });
}

main()
  .catch((err) => {
    logger.error('cleanupExpiredTokens failed', { err });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
