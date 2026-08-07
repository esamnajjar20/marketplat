import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { logger } from './logger';
import type { CreateActivityInput } from '../../modules/activity/activity.repository';

// FIX OPS-1.1: activityService.record() used to call
// activityRepository.create() directly — one INSERT per user action
// (ad view, page open, button click) across 36 call sites spread over
// 11 modules. Under real traffic that's an unbounded number of tiny
// writes competing with the app's actual transactional writes for the
// same Postgres connection pool/IOPS budget, and a burst of visitors
// can exhaust it well before any single "big" query would.
//
// Mirrors viewsBuffer.ts's buffer-in-Redis-then-flush-on-a-timer shape,
// with one deliberate difference: viewsBuffer accumulates a single
// integer per ad (INCR is enough, since only the *count* matters), but
// an activity row is a distinct record with its own type/title/
// metadata — there's nothing to numerically collapse, so this pushes
// each one as a serialized JSON string onto a single Redis list
// (RPUSH) and flushes the whole list to one createMany() per tick
// instead of accumulating per-key counters.
//
// FLUSH_INTERVAL is intentionally much shorter than viewsBuffer's 60s:
// /activity is a user-facing timeline (see activity.service.ts's
// getMyActivity, backing the frontend's "نشاطي" page) that a user can
// open right after performing the action that generated it, unlike a
// view counter nobody is watching in real time. 5s keeps the batching
// benefit (bursts still collapse into one insert) while keeping the
// worst-case staleness low enough not to read as "my action didn't
// save".
const BUFFER_KEY = 'activity_buffer:pending';
const FLUSH_INTERVAL = 5_000;
// Hard cap per flush so one runaway burst can't build a single
// createMany() call large enough to itself become a slow/blocking
// query — the same trade-off runWithQueryTimeout's callers make
// elsewhere in this codebase, just applied on the write side. Any
// remainder simply waits for the next tick instead of being dropped.
const MAX_BATCH_PER_FLUSH = 500;
// Safety-net TTL on the list key, same reasoning as viewsBuffer's
// VIEWS_BUFFER_TTL_SECONDS: if flush() throws before it finishes
// draining the list, the key must still expire eventually rather than
// growing forever from a wedged flush loop.
const BUFFER_TTL_SECONDS = 24 * 60 * 60;

let flushTimer: ReturnType<typeof setInterval> | null = null;

export const activityBuffer = {
  /**
   * Push one activity write onto the buffer instead of writing it to
   * Postgres immediately. Never throws — same fire-and-forget contract
   * activityService.record() already promises its callers (15+ call
   * sites with no `.catch()`), just moved one layer down.
   */
  push: async (input: CreateActivityInput): Promise<void> => {
    try {
      await redis
        .pipeline()
        .rpush(BUFFER_KEY, JSON.stringify({ ...input, createdAt: new Date().toISOString() }))
        .expire(BUFFER_KEY, BUFFER_TTL_SECONDS)
        .exec();
    } catch (err) {
      // Redis unavailable — fall back to a direct write so a Redis
      // outage degrades to "back to today's per-row insert cost"
      // rather than silently dropping the activity entirely.
      logger.warn('activityBuffer push failed, falling back to direct write', { err });
      await prisma.userActivity.create({ data: input }).catch((createErr) => {
        logger.error('Failed to write user activity (buffer + direct fallback both failed)', {
          err: createErr,
          userId: input.userId,
          type: input.type,
        });
      });
    }
  },

  /**
   * Drain up to MAX_BATCH_PER_FLUSH buffered entries and insert them
   * in one createMany() call. Called on a timer and on graceful
   * shutdown (see server.ts's shutdown/uncaughtException handlers,
   * mirroring viewsBuffer.stopFlushTimer()'s final-flush convention).
   */
  flush: async (): Promise<void> => {
    try {
      // ioredis reflects Redis 6.2+'s LPOP key count form directly:
      // lpop(key, count) removes and returns up to `count` elements
      // from the head in one round trip, or null if the key doesn't
      // exist / is empty — no separate LRANGE+LTRIM pair needed (which
      // would also be non-atomic across two calls).
      const raw = await redis.lpop(BUFFER_KEY, MAX_BATCH_PER_FLUSH);
      if (!raw || raw.length === 0) return;

      const entries = raw
        .map((item) => {
          try {
            return JSON.parse(item) as CreateActivityInput & { createdAt: string };
          } catch {
            return null;
          }
        })
        .filter((entry): entry is CreateActivityInput & { createdAt: string } => entry !== null);

      if (entries.length === 0) return;

      await prisma.userActivity.createMany({
        data: entries.map(({ createdAt, ...rest }) => ({
          ...rest,
          createdAt: new Date(createdAt),
        })),
      });

      logger.debug(`Activity buffer flushed: ${entries.length} rows`);
    } catch (err) {
      logger.error('Activity buffer flush failed', err);
    }
  },

  startFlushTimer: (): void => {
    if (flushTimer) return;
    flushTimer = setInterval(() => {
      activityBuffer.flush().catch(() => {});
    }, FLUSH_INTERVAL);
    flushTimer.unref(); // don't keep process alive
    logger.info(`Activity buffer flush timer started (every ${FLUSH_INTERVAL / 1000}s)`);
  },

  stopFlushTimer: async (): Promise<void> => {
    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
    // Final flush on shutdown, same convention as viewsBuffer.
    // Loop until the list is empty rather than a single flush() call,
    // since a busy instance can have more than MAX_BATCH_PER_FLUSH
    // queued at shutdown time.
    let remaining = await redis.llen(BUFFER_KEY).catch(() => 0);
    while (remaining > 0) {
      await activityBuffer.flush();
      remaining = await redis.llen(BUFFER_KEY).catch(() => 0);
    }
  },
};
