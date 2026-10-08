import { prisma } from '../../config/prisma';
import { logger } from './logger';
import { Prisma } from '@prisma/client';
import { backgroundTaskFailuresTotal, backgroundTaskFailurePersistenceTotal } from './metrics';

/**
 * / M-012 — silent-failure safety net for fire-and-forget
 * background work (notification fan-out, fraud scoring, ...).
 *
 * This app has no message queue (BullMQ or similar) to retry failed
 * fire-and-forget calls automatically. Previously a transient failure
 * (a DB blip, a momentary Redis hiccup) in one of these calls just
 * logged an error and the work vanished for good — e.g. a user who
 * favorited an ad never learns its price dropped, or an ad that should
 * have been flagged for fraud review never gets scored at all, with
 * nothing anywhere indicating this happened.
 *
 * recordFailedTask persists just enough to retry the operation later
 * (or at minimum, to know it needs a human look) into
 * FailedBackgroundTask, in addition to the existing logger.error call
 * every fire-and-forget .catch() already makes. It is itself
 * best-effort and swallows its own errors — a failure while recording
 * a failure must never throw or create a second silent gap.
 */
export async function recordFailedTask(
  taskType: string,
  payload: Record<string, unknown>,
  error: unknown
): Promise<void> {
  try {
    await prisma.failedBackgroundTask.create({
      data: {
        taskType,
        payload: payload as Prisma.InputJsonValue,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    backgroundTaskFailuresTotal.inc({ task_type: taskType.slice(0, 100), outcome: 'recorded' });
  } catch (persistError) {
    backgroundTaskFailurePersistenceTotal.inc({ task_type: taskType.slice(0, 100) });
    backgroundTaskFailuresTotal.inc({ task_type: taskType.slice(0, 100), outcome: 'persistence_failed' });
    logger.error('Failed to persist FailedBackgroundTask record itself', {
      taskType,
      persistError: persistError instanceof Error ? persistError.message : String(persistError),
    });
  }
}
