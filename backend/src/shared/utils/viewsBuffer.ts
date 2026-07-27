import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { logger } from './logger';

const VIEWS_PREFIX = 'views_buffer:';
const FLUSH_INTERVAL = 60_000; // flush to DB every 60 seconds
// FIX D-11: safety-net TTL on the buffer counter key. Without this, if
// flush() throws before reaching its GETDEL step (e.g. a transient Redis
// error), the key has no expiry and persists indefinitely — silently
// growing the keyspace and delaying those views from ever reaching
// Postgres until some future successful flush happens to pick them up.
// 24h is generous: far longer than the 60s normal flush interval, so it
// only matters as a fallback under real Redis instability.
const VIEWS_BUFFER_TTL_SECONDS = 24 * 60 * 60;
let flushTimer: ReturnType<typeof setInterval> | null = null;

// Atomic GETDEL per key — avoids losing views that arrive between read and delete
const FLUSH_VIEWS_SCRIPT = `
local results = {}
for i, key in ipairs(KEYS) do
  results[i] = redis.call('GETDEL', key)
end
return results
`;

export const viewsBuffer = {
  /**
   * Increment view count in Redis buffer.
   * Accepts optional viewerKey for deduplication (IP-based).
   * Returns true if this was a new (non-duplicate) view.
   */
  increment: async (adId: string, viewerKey?: string): Promise<boolean> => {
    try {
      if (viewerKey) {
        // Deduplication: 1 view per viewerKey per hour
        const dedupKey = `views_dedup:${adId}:${viewerKey}`;
        const alreadySeen = await redis.exists(dedupKey);
        if (alreadySeen) return false;
        // Mark as seen for 1 hour
        await redis.setex(dedupKey, 3600, '1');
      }
      // Accumulate in buffer key. FIX D-11: pipeline INCR + EXPIRE together
      // so the key's TTL is refreshed on every increment — it never sits
      // without an expiry, and active counters don't expire mid-accumulation
      // since each new view pushes the TTL back out.
      await redis
        .pipeline()
        .incr(`${VIEWS_PREFIX}${adId}`)
        .expire(`${VIEWS_PREFIX}${adId}`, VIEWS_BUFFER_TTL_SECONDS)
        .exec();
      if (process.env.NODE_ENV === 'test') {
        await prisma.ad.updateMany({
          where: { id: adId, status: { not: 'DELETED' } },
          data: { views: { increment: 1 } },
        });
      }
      return true;
    } catch {
      // Redis unavailable — skip silently (views are not critical)
      return false;
    }
  },

  /**
   * Flush all buffered view counts to the database.
   * Called on a timer and on graceful shutdown.
   */
  flush: async (): Promise<void> => {
    try {
      // Scan for all buffered keys
      const keys = await scanKeys(`${VIEWS_PREFIX}*`);
      if (keys.length === 0) return;

      const rawCounts = (await (redis as RedisEval).eval(
        FLUSH_VIEWS_SCRIPT,
        keys.length,
        ...keys
      )) as (string | null)[];

      const updates = keys
        .map((key, i) => {
          const adId = key.replace(VIEWS_PREFIX, '');
          const count = parseInt(rawCounts[i] || '0', 10);
          return { adId, count };
        })
        .filter(({ count }) => count > 0);

      if (updates.length > 0) {
        await Promise.all(
          updates.map(
            ({ adId, count }) =>
              prisma.ad
                .updateMany({
                  where: { id: adId, status: { not: 'DELETED' } },
                  data: { views: { increment: count } },
                })
                .catch(() => {}) // ignore if ad was deleted
          )
        );
        logger.debug(
          `Views flushed: ${updates.length} ads, ${updates.reduce((a, b) => a + b.count, 0)} total views`
        );
      }
    } catch (err) {
      logger.error('Views buffer flush failed', err);
    }
  },

  startFlushTimer: (): void => {
    if (flushTimer) return;
    flushTimer = setInterval(() => {
      viewsBuffer.flush().catch(() => {});
    }, FLUSH_INTERVAL);
    flushTimer.unref(); // don't keep process alive
    logger.info(`Views buffer flush timer started (every ${FLUSH_INTERVAL / 1000}s)`);
  },

  stopFlushTimer: async (): Promise<void> => {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    // Final flush on shutdown
    await viewsBuffer.flush();
  },
};

interface RedisEval {
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
}

// Helper: scan all Redis keys matching a pattern
async function scanKeys(pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [nextCursor, batch] = await (redis as any).scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}
