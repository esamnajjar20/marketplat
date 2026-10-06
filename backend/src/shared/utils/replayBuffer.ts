/**
 * SSE replay buffer — a short-lived per-user Redis Stream.
 *
 * Every persistable live event (notification / message:*) is XADDed to
 * `sse:replay:<userId>`; the stream entry id (`<ms>-<seq>`, strictly increasing
 * per stream) is used verbatim as the SSE `id:`. A reconnecting client sends
 * `Last-Event-ID` and gets everything after it replayed.
 *
 * The buffer is DISPOSABLE by design (it lives on the cache Redis, which may
 * evict). Whatever it cannot guarantee it reports as `gap`, and the client
 * answers a gap with a plain refetch from Postgres — the source of truth.
 *
 * Pure w.r.t. the Redis client: it is injected, so tests need no server.
 */

export interface ReplayRedis {
  pipeline(): ReplayPipeline;
  xrange(
    key: string,
    start: string,
    end: string,
    countKeyword: 'COUNT',
    count: number,
  ): Promise<Array<[string, string[]]>>;
  xlen(key: string): Promise<number>;
}
export interface ReplayPipeline {
  xadd(...args: Array<string | number>): ReplayPipeline;
  expire(key: string, seconds: number): ReplayPipeline;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
}

export interface ReplayOptions {
  /** Entries kept per user (exact trim). 0 disables the buffer. */
  maxEvents: number;
  /** Stream key TTL, refreshed on every append. */
  ttlSeconds: number;
}

export const replayKey = (userId: string): string => `sse:replay:${userId}`;

const ID_RE = /^(\d{1,16})-(\d{1,16})$/;

export function parseEventId(id: unknown): { ms: number; seq: number } | null {
  if (typeof id !== 'string') return null;
  const m = ID_RE.exec(id);
  if (!m) return null;
  return { ms: Number(m[1]), seq: Number(m[2]) };
}

/** <0 if a is older than b, 0 if equal, >0 if newer. Unparseable ids compare as 0. */
export function compareEventIds(a: string, b: string): number {
  const pa = parseEventId(a);
  const pb = parseEventId(b);
  if (!pa || !pb) return 0;
  return pa.ms !== pb.ms ? pa.ms - pb.ms : pa.seq - pb.seq;
}

/** Smallest id strictly greater than `id` (an exclusive XRANGE lower bound that also works on Redis < 6.2). */
export function nextEventId(id: string): string | null {
  const p = parseEventId(id);
  return p ? `${p.ms}-${p.seq + 1}` : null;
}

/** Returns the new entry id, or null when disabled / Redis failed (caller then publishes live-only). */
export async function appendReplayEvent(
  client: ReplayRedis,
  userId: string,
  event: unknown,
  opts: ReplayOptions,
): Promise<string | null> {
  if (opts.maxEvents <= 0) return null;
  const key = replayKey(userId);
  const res = await client
    .pipeline()
    .xadd(key, 'MAXLEN', opts.maxEvents, '*', 'e', JSON.stringify(event))
    .expire(key, opts.ttlSeconds)
    .exec();
  const first = res?.[0];
  if (!first || first[0]) return null;
  return typeof first[1] === 'string' ? first[1] : null;
}

export interface ReplayResult {
  events: Array<{ id: string; event: unknown }>;
  /** True when the buffer cannot prove it still holds everything after lastEventId → client must refetch. */
  gap: boolean;
}

export async function readReplayEvents(
  client: ReplayRedis,
  userId: string,
  lastEventId: string,
  opts: ReplayOptions,
  nowMs: number = Date.now(),
): Promise<ReplayResult> {
  const last = parseEventId(lastEventId);
  const from = nextEventId(lastEventId);
  if (!last || !from) return { events: [], gap: false }; // not a usable id: treat as a fresh connection
  if (opts.maxEvents <= 0) return { events: [], gap: true };

  // Older than the buffer's lifetime → the key may have expired; don't pretend.
  if (nowMs - last.ms > opts.ttlSeconds * 1000) return { events: [], gap: true };

  const key = replayKey(userId);
  // xlen is gone — the gap decision must not use it.
  const rows = await client.xrange(key, from, '+', 'COUNT', opts.maxEvents);

  const events: ReplayResult['events'] = [];
  for (const [id, fields] of rows) {
    const idx = fields.indexOf('e');
    if (idx === -1) continue;
    try {
      events.push({ id, event: JSON.parse(fields[idx + 1]) });
    } catch {
      /* corrupt entry — skip */
    }
  }

  // XRANGE returned exactly COUNT entries → more entries
  // may exist past the window, so continuity cannot be proven. The old check
  // compared against xlen and missed exactly this case: a tail longer than
  // COUNT made rows.length (capped) < len, gap stayed false, and the client
  // silently lost everything past the cap. Conservative: any doubt → gap →
  // client refetches from Postgres.
  const gap = rows.length >= opts.maxEvents;
  return { events, gap };
}
