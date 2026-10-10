import { prisma } from '../config/prisma';
import { logger } from '../shared/utils/logger';
import { runOutboxWorker } from '../shared/outbox/outbox.worker';

let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  process.exitCode = 0;
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

runOutboxWorker(() => stopping)
  .catch((error) => {
    logger.error('Transactional outbox worker terminated unexpectedly', { error });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
