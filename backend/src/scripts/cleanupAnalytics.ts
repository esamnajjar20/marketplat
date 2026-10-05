import { prisma } from '../config/prisma';
import { env } from '../config/env';

const BATCH_SIZE = 5_000;

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
async function main(): Promise<void> {
  const cutoff = new Date(Date.now() - env.analytics.retentionDays * 24 * 60 * 60 * 1000);
  let deleted = 0;

  while (true) {
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

  console.log(`[analytics-retention] cutoff=${cutoff.toISOString()} deleted=${deleted}`);
}

main()
  .catch((error) => {
    console.error('[analytics-retention] cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
