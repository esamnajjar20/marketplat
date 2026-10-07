/**
 * Live notification fan-out (SSE).
 *
 * GET /notifications/stream holds an open response per client.
 * create/createMany publish a small JSON event to that user's sockets
 * and over Redis so other app instances deliver too.
 *
 * resumable stream:
 *  - Persistable events (notification, message:*) are appended to a short-lived
 *    per-user Redis Stream (replayBuffer.ts); the entry id is sent as the SSE
 *    `id:`. A client that reconnects with `Last-Event-ID` gets what it missed
 *    replayed, or an `event: resync` when the buffer cannot prove completeness.
 *  - `typing` is ephemeral: live only, never buffered, no id.
 *  - Bulk fan-outs (admin broadcasts) skip the buffer: one stream per recipient
 *    for 100K users would cost far more memory than a missed promo toast is
 *    worth; their rows are in Postgres and the client refetches on reconnect.
 *  - The publisher used to receive its own Redis message back and deliver it a
 *    second time to its local clients; messages now carry an origin and a
 *    process ignores its own.
 */
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import type { NotificationType } from '@prisma/client';
import type Redis from 'ioredis';
import { env } from '../../config/env';
import { redis, cacheRedis } from '../../config/redis';
import { logger } from './logger';
import {
  appendReplayEvent,
  compareEventIds,
  parseEventId,
  readReplayEvents,
  type ReplayOptions,
  type ReplayRedis,
} from './replayBuffer';

/** Unified SSE payload — notifications + chat messages on one stream. */
export type LiveStreamEvent =
  | {
      type: 'notification';
      action: 'created' | 'updated' | 'read' | 'deleted';
      notificationId?: string;
      notificationType?: NotificationType | string;
      title?: string;
      body?: string;
      /** Small per-type payload (conversationId, adId, requestId…) so the client
       * can deep-link without a refetch. Mirrors Notification.data. */
      data?: Record<string, unknown> | null;
    }
  | {
      type: 'message:new';
      conversationId: string;
      message: {
        id: string;
        conversationId: string;
        senderId: string;
        body: string;
        readAt: string | null;
        deletedAt: string | null;
        createdAt: string;
      };
    }
  | {
      type: 'message:deleted';
      conversationId: string;
      messageId: string;
      deletedAt: string;
    }
  | {
      type: 'typing';
      conversationId: string;
      userId: string;
      isTyping: boolean;
    };

/** @deprecated alias — prefer LiveStreamEvent */
export type NotificationLiveEvent = LiveStreamEvent;

const CHANNEL = 'notifications:live';

/** Distinguishes this process's own Redis echoes (PM2 cluster = several processes). */
const INSTANCE_ID = randomUUID();

/** Above this many recipients an event is delivered live only (see header). */
const BULK_NO_BUFFER_THRESHOLD = 200;
/** The buffer must never slow a publish noticeably; past this we go live-only. */
const REPLAY_IO_TIMEOUT_MS = 300;
/** Replay on connect is allowed a little longer — it runs once per reconnect. */
const REPLAY_READ_TIMEOUT_MS = 1_500;
/** Hard cap for live events that arrive while a reconnect is replaying.
 * Overflow is handled as a consistency gap: discard the partial queue and
 * ask the client to refetch authoritative state instead of growing memory. */
const MAX_PENDING_EVENTS = 250;

type Client = {
  res: Response;
  heartbeat: NodeJS.Timeout;
  /** False while the replay for a reconnect is being written; live events queue in `pending` meanwhile. */
  ready: boolean;
  pending: Array<{ id?: string; payload: LiveStreamEvent }>;
  /** Highest id written to this client — drops duplicates between replay and live. */
  lastSentId?: string;
  /**
   * true only while replayThenGoLive writes replayed
   * entries. The "already sent" id check in sendToClient runs ONLY then —
   * live delivery must never drop a message just because a concurrent
   * publish of a different event finished its XADD first (id order is not
   * the same as real arrival order under Promise.all).
   */
  duringReplay: boolean;
  pendingOverflow: boolean;
};

const localClients = new Map<string, Set<Client>>();

let subscriber: Redis | null = null;
let redisReady: Promise<void> | null = null;

function replayOptions(): ReplayOptions {
  // Optional chaining: some unit-test mocks of `env` predate 
  return {
    maxEvents: env.sseReplay?.maxEvents ?? 100,
    ttlSeconds: env.sseReplay?.ttlSeconds ?? 3600,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/** Typing indicators are ephemeral by nature; everything else can be replayed. */
function isReplayable(event: LiveStreamEvent): boolean {
  return event.type !== 'typing';
}

function eventNameFor(payload: LiveStreamEvent): 'message' | 'notification' {
  return payload.type === 'message:new' ||
    payload.type === 'message:deleted' ||
    payload.type === 'typing'
    ? 'message'
    : 'notification';
}

function writeSse(res: Response, event: string, data: unknown, id?: string): void {
  res.write(`${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Writes one event to one client, skipping anything it has already been sent. */
function sendToClient(client: Client, payload: LiveStreamEvent, id?: string): void {
  // dedup only during replay; live order is not guaranteed.
  if (client.duringReplay && id && client.lastSentId && compareEventIds(id, client.lastSentId) <= 0) return;
  try {
    writeSse(client.res, eventNameFor(payload), payload, id);
    if (id) client.lastSentId = id;
  } catch {
    /* gone */
  }
}

function deliverLocal(userId: string, payload: LiveStreamEvent, id?: string): void {
  const set = localClients.get(userId);
  if (!set || set.size === 0) return;
  for (const client of set) {
    if (!client.ready) {
      if (client.pending.length >= MAX_PENDING_EVENTS) {
        client.pending = [];
        client.pendingOverflow = true;
      } else if (!client.pendingOverflow) {
        client.pending.push({ id, payload });
      }
      continue;
    }
    sendToClient(client, payload, id);
  }
}

function ensureRedisSub(): Promise<void> {
  if (redisReady) return redisReady;
  redisReady = (async () => {
    try {
      subscriber = redis.duplicate();
      subscriber.on('error', (err) => {
        logger.warn('notificationStream subscriber error', { err });
      });
      if (subscriber.status === 'wait') {
        await subscriber.connect();
      }
      await subscriber.subscribe(CHANNEL);
      subscriber.on('message', (channel, message) => {
        if (channel !== CHANNEL) return;
        try {
          const parsed = JSON.parse(message) as {
            userId: string;
            event: LiveStreamEvent;
            id?: string | null;
            origin?: string;
          };
          // Already delivered synchronously by publishNotificationEvent in this process.
          if (parsed?.origin === INSTANCE_ID) return;
          if (parsed?.userId && parsed.event) {
            deliverLocal(parsed.userId, parsed.event, parsed.id ?? undefined);
          }
        } catch {
          /* ignore */
        }
      });
      logger.info('notificationStream Redis pub/sub ready');
    } catch (err) {
      logger.warn('notificationStream Redis unavailable — local-only fan-out', { err });
      subscriber = null;
    }
  })();
  return redisReady;
}

/** Appends to the replay buffer; null = not buffered (disabled, failed or slow) → live-only. */
async function bufferEvent(userId: string, event: LiveStreamEvent): Promise<string | null> {
  try {
    return await withTimeout(
      appendReplayEvent(cacheRedis as unknown as ReplayRedis, userId, event, replayOptions()),
      REPLAY_IO_TIMEOUT_MS,
    );
  } catch (err) {
    logger.warn('notificationStream replay append failed — live-only', {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Writes the replay for a reconnect, then switches the client to live mode.
 * Everything from the first `await` result to `ready = true` is synchronous,
 * so no live event can slip between "replayed" and "live".
 */
async function replayThenGoLive(userId: string, client: Client, lastEventId?: string): Promise<void> {
  let gap = false;
  if (lastEventId && parseEventId(lastEventId)) {
    try {
      const result = await withTimeout(
        readReplayEvents(cacheRedis as unknown as ReplayRedis, userId, lastEventId, replayOptions()),
        REPLAY_READ_TIMEOUT_MS,
      );
      gap = result.gap;
      // On a gap the client refetches everything anyway; replaying a partial
      // tail first would only apply some events twice.
      if (!gap) {
        for (const { id, event } of result.events) {
          // a >BULK_NO_BUFFER_THRESHOLD fan-out left only
          // this tiny marker (its real events were never buffered), so the
          // tail is not a complete record. Treat it as a gap → resync.
          if ((event as { __bulkGap?: boolean } | null | undefined)?.__bulkGap === true) {
            gap = true;
            break;
          }
          sendToClient(client, event as LiveStreamEvent, id);
        }
      }
    } catch (err) {
      gap = true;
      logger.warn('notificationStream replay read failed — asking client to resync', {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // keep duringReplay=true while flushing `pending`
  // so sendToClient still drops ids already written during Redis replay.
  // Supersedes that earlier duringReplay
  // before the flush and is now moved below it.
  // Previously duringReplay was cleared first, so an event published
  // mid-replay (buffered in pending AND present in the replay tail)
  // was delivered twice — NotificationToasts showed duplicate toasts.
  const overflowed = client.pendingOverflow;
  try {
    if (gap || overflowed) {
      writeSse(client.res, 'resync', { reason: overflowed ? 'pending_overflow' : 'replay_gap' });
    }
  } catch {
    /* gone */
  }

  const queued = client.pending;
  client.pending = [];
  client.pendingOverflow = false;
  // If the queue overflowed, none of its remaining tail can be trusted: a
  // resync is the complete recovery path. Never flush a partial event set.
  if (!overflowed) {
    for (const item of queued) sendToClient(client, item.payload, item.id);
  }
  client.duringReplay = false;
  client.ready = true;
}

export function addNotificationStreamClient(
  userId: string,
  res: Response,
  opts: { lastEventId?: string } = {},
): () => void {
  void ensureRedisSub();

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      /* ignore */
    }
  }, 25_000);

  const client: Client = { res, heartbeat, ready: false, pending: [], pendingOverflow: false, duringReplay: true };
  let set = localClients.get(userId);
  if (!set) {
    set = new Set();
    localClients.set(userId, set);
  }
  set.add(client);

  writeSse(res, 'connected', { ok: true, resumed: Boolean(opts.lastEventId) });
  void replayThenGoLive(userId, client, opts.lastEventId);

  const cleanup = () => {
    clearInterval(heartbeat);
    const bucket = localClients.get(userId);
    if (!bucket) return;
    bucket.delete(client);
    if (bucket.size === 0) localClients.delete(userId);
  };

  res.on('close', cleanup);
  return cleanup;
}

export async function publishNotificationEvent(
  userId: string,
  event: LiveStreamEvent,
  opts: { buffer?: boolean } = {},
): Promise<void> {
  const id =
    opts.buffer !== false && isReplayable(event) ? await bufferEvent(userId, event) : null;

  deliverLocal(userId, event, id ?? undefined);

  try {
    await ensureRedisSub();
    await redis.publish(CHANNEL, JSON.stringify({ userId, event, id, origin: INSTANCE_ID }));
  } catch (err) {
    logger.warn('notificationStream publish failed', { err, userId });
  }
}

/**
 * best-effort marker appended to a user's replay stream when
 * a fan-out is too large to buffer. Seeing it on reconnect, replayThenGoLive
 * emits `resync` (client refetches from Postgres) instead of trusting an
 * empty tail. Cost is one XADD per recipient, independent of fan-out size.
 */
async function appendBulkGapMarker(userId: string): Promise<void> {
  try {
    await withTimeout(
      appendReplayEvent(
        cacheRedis as unknown as ReplayRedis,
        userId,
        { __bulkGap: true },
        replayOptions(),
      ),
      REPLAY_IO_TIMEOUT_MS,
    );
  } catch (err) {
    logger.warn('notificationStream bulk gap marker failed — client may miss the resync', {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function publishNotificationEventToMany(
  userIds: string[],
  event: LiveStreamEvent,
): Promise<void> {
  const unique = Array.from(new Set(userIds));
  const buffer = unique.length <= BULK_NO_BUFFER_THRESHOLD;
  if (!buffer) {
    // no per-user replay entry for the real event; drop a
    // marker so a reconnecting client knows its replay tail is not complete.
    await Promise.all(unique.map((id) => appendBulkGapMarker(id)));
  }
  await Promise.all(unique.map((id) => publishNotificationEvent(id, event, { buffer })));
}
