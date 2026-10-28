import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../shared/utils/logger';

const BATCH_SIZE = 5_000;
const GO_WORKER_TIMEOUT_MS = 9 * 60 * 1_000;

/**
 * Prefer the optional Go worker for this bounded maintenance job. If the Go
 * worker is not configured or cannot complete the request, use the original
 * Prisma implementation below. This keeps Express as the reliable fallback
 * and leaves deployments without Go completely unchanged.
 */
async function tryGoWorker(): Promise<'completed' | 'busy' | 'fallback'> {
  const baseUrl = process.env.GO_WORKER_URL?.trim().replace(/\/$/, '');
  const token = process.env.GO_WORKER_TOKEN?.trim();
  if (!baseUrl || !token) return 'fallback';

  try {
    const response = await fetch(`${baseUrl}/internal/jobs/analytics-retention`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // Express is the source of truth for retention policy so Go and fallback
      // cannot silently use different retention windows.
      body: JSON.stringify({ retentionDays: env.analytics.retentionDays }),
      signal: AbortSignal.timeout(GO_WORKER_TIMEOUT_MS),
    });

    if (response.status === 409) {
      // Another Go worker already owns this job's advisory lock. Do not start
      // the Express fallback concurrently; the active worker is doing the work.
      logger.info('[analytics-retention] Go worker reports job already running; skipping duplicate run');
      return 'busy';
    }

    if (response.ok) {
      const result = (await response.json()) as { deleted?: number; batches?: number; cutoff?: string };
      logger.info('[analytics-retention] Go worker completed', {
        deleted: result.deleted,
        batches: result.batches,
        cutoff: result.cutoff,
      });
      return 'completed';
    }

    logger.warn('[analytics-retention] Go worker returned a failure; falling back to Express', {
      status: response.status,
    });
    return 'fallback';
  } catch (error) {
    // Do not log the URL or token; worker addresses can contain internal
    // routing details. The original implementation remains available.
    logger.warn('[analytics-retention] Go worker unavailable; falling back to Express', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return 'fallback';
  }
}

/**
 * Retains raw analytics only for the configured window. The admin dashboard
 * currently exposes 7/30/90-day ranges, so 90 days preserves every range
 * the product actually offers without allowing PAGE_VIEW volume to grow
 * without bound.
 *
 * Deletion is deliberately batched: a single large DELETE can hold locks and
 * create a large WAL burst on a small Postgres instance. This job is safe to
 * run repeatedly and stops when the oldest batch is exhausted.
 */
async function runExpressFallback(): Promise<void> {
  const cutoff = new Date(Date.now() - env.analytics.retentionDays * 24 * 60 * 60 * 1000);
  let deleted = 0;

  for (;;) {
    const rows = await prisma.$queryRaw<{ id: string }[]>`
      WITH doomed AS (
        SELECT id
        FROM "analytics_events"
        WHERE "createdAt" < ${cutoff}
        ORDER BY "createdAt" ASC
        LIMIT ${BATCH_SIZE}
      )
      DELETE FROM "analytics_events" e
      USING doomed
      WHERE e.id = doomed.id
      RETURNING e.id
    `;

    deleted += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(`[analytics-retention] engine=express-fallback cutoff=${cutoff.toISOString()} deleted=${deleted}`);
}

async function main(): Promise<void> {
  const result = await tryGoWorker();
  if (result === 'completed' || result === 'busy') return;
  await runExpressFallback();
}

main()
  .catch(error => {
    console.error('[analytics-retention] cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
