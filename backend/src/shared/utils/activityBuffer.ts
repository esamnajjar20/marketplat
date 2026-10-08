import { reportBackgroundFailure } from './backgroundTask';
import { redis } from '../../config/redis';
import { prisma } from '../../config/prisma';
import { logger } from './logger';
import crypto from 'crypto';
import type { CreateActivityInput } from '../../modules/activity/activity.repository';

// activityService.record() used to call
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
// Upper bound on the shutdown drain loop (stopFlushTimer below).
// Without this, a persistently-failing DB (createMany throwing on
// every retry) leaves `remaining` permanently > 0 and the loop spins
// until server.ts's force-exit timer kills the process mid-shutdown
// (10s, exit 1) instead of letting it shut down cleanly. Any entries
// still unflushed after this many iterations remain in the shared
// Redis buffer and will be drained by another worker (or this one on
// next boot) once the DB recovers — the buffer key's own 24h TTL is
// the ultimate safety net.
const MAX_DRAIN_ITERATIONS = 100;

let flushTimer: ReturnType<typeof setInterval> | null = null;

export const activityBuffer = {
  /**
   * Push one activity write onto the buffer instead of writing it to
   * Postgres immediately. Never throws — same fire-and-forget contract
   * activityService.record() already promises its callers (15+ call
   * sites with no `.catch()`), just moved one layer down.
   */
  push: async (input: CreateActivityInput): Promise<void> => {
    // T452 — idempotencyKey is generated HERE (once, in the caller's
    // process) and carried through every subsequent hop (Redis list,
    // parse, createMany, and any re-push on failure). Re-pushing the
    // same serialized entry therefore reuses the same key, and the
    // flush's skipDuplicates:true turns the retry into a no-op if the
    // original createMany actually committed (the "response was lost"
    // failure mode createMany alone can't distinguish from "the
    // insert never ran").
    const idempotencyKey = crypto.randomUUID();
    try {
      // T454 — pipeline().exec() only REJECTS on transport-level
      // failure. Command-level errors (WRONGTYPE if the buffer key was
      // clobbered, OOM, READONLY, etc.) resolve as [err, result] pairs
      // and would otherwise be swallowed — the fallback below would
      // never fire and the activity would be silently lost. Inspect
      // the results and force the fallback path on any per-command
      // error.
      const results = await redis
        .pipeline()
        .rpush(BUFFER_KEY, JSON.stringify({ ...input, idempotencyKey, createdAt: new Date().toISOString() }))
        .expire(BUFFER_KEY, BUFFER_TTL_SECONDS)
        .exec();
      const commandError = results?.find(([err]) => err)?.[0];
      if (commandError) {
        throw commandError;
      }
    } catch (err) {
      // Redis unavailable — fall back to a direct write so a Redis
      // outage degrades to "back to today's per-row insert cost"
      // rather than silently dropping the activity entirely.
      logger.warn('activityBuffer push failed, falling back to direct write', { err });
      await prisma.userActivity.create({ data: { ...input, idempotencyKey } }).catch((createErr) => {
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

      let parseFailures = 0;
      const entries = raw
        .map((item) => {
          try {
            return JSON.parse(item) as CreateActivityInput & { createdAt: string };
          } catch {
            parseFailures++;
            return null;
          }
        })
        .filter((entry): entry is CreateActivityInput & { createdAt: string } => entry !== null);

      if (parseFailures > 0) {
        // Previously silent — a corrupted buffer entry would just vanish
        // from the batch. Logged so a bad writer (or a Redis value
        // tampered with) is visible instead of silently reducing the
        // flushed row count.
        logger.warn('Activity buffer: dropped unparseable entries', { parseFailures });
      }

      if (entries.length === 0) return;

      try {
        // T452 — skipDuplicates:true is the actual guard. If a prior
        // createMany committed but its response was lost, the entries
        // re-pushed by the failed-attempt branch below will carry the
        // same idempotencyKey values and be silently skipped here,
        // rather than inserted a second time. Requires the unique
        // index on UserActivity.idempotencyKey (migration
        // 20260923120001_add_user_activity_idempotency_key).
        await prisma.userActivity.createMany({
          data: entries.map(({ createdAt, ...rest }) => ({
            ...rest,
            createdAt: new Date(createdAt),
          })),
          skipDuplicates: true,
        });
        logger.debug(`Activity buffer flushed: ${entries.length} rows`);
      } catch (createErr) {
        // CRITICAL: LPOP already removed these from Redis. If we just
        // log-and-return (the previous behavior) they are gone forever
        // — no retry, no record. Re-push them to the head of the list
        // so the next tick retries the same batch (createMany is a
        // single SQL statement — all-or-nothing — so this can never
        // produce duplicates of rows that actually committed).
        //
        // LPUSH with multiple args prepends each in turn, so passing
        // the popped array reversed restores the original head order
        // ([a,b,c] popped → LPUSH c b a → [a,b,c,...rest]).
        try {
          await redis.lpush(BUFFER_KEY, ...entries.map((e) =>
            JSON.stringify({ ...e, createdAt: new Date(e.createdAt).toISOString() })
          ).reverse());
          logger.warn('Activity buffer flush failed — entries re-pushed for retry', {
            count: entries.length,
            err: createErr,
          });
        } catch (repushErr) {
          logger.error(
            'Activity buffer flush failed AND re-push failed — entries lost',
            { count: entries.length, createErr, repushErr },
          );
        }
      }
    } catch (err) {
      logger.error('Activity buffer flush failed (pre-DB stage)', err);
    }
  },

  startFlushTimer: (): void => {
    if (flushTimer) return;
    flushTimer = setInterval(() => {
      activityBuffer.flush().catch((error) => reportBackgroundFailure('backend/src/shared/utils/activityBuffer.ts', error));
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
    // queued at shutdown time. Capped by MAX_DRAIN_ITERATIONS so a
    // wedged DB (flush failing every tick) can't spin here past the
    // caller's force-exit timeout.
    let remaining = await redis.llen(BUFFER_KEY).catch(() => 0);
    let iterations = 0;
    while (remaining > 0 && iterations < MAX_DRAIN_ITERATIONS) {
      await activityBuffer.flush();
      remaining = await redis.llen(BUFFER_KEY).catch(() => 0);
      iterations++;
    }
    if (remaining > 0) {
      logger.warn(
        'Activity buffer drain hit MAX_DRAIN_ITERATIONS before emptying — remaining entries stay buffered for next worker/boot',
        { remaining, iterations },
      );
    }
  },
};
