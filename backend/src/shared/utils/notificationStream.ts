/**
 * Live notification fan-out (SSE).
 *
 * GET /notifications/stream holds an open response per client.
 * create/createMany publish a small JSON event to that user's sockets
 * and over Redis so other app instances deliver too.
 */
import type { Response } from 'express';
import type { NotificationType } from '@prisma/client';
import type Redis from 'ioredis';
import { redis } from '../../config/redis';
import { logger } from './logger';

/** Unified SSE payload — notifications + chat messages on one stream. */
export type LiveStreamEvent =
  | {
      type: 'notification';
      action: 'created' | 'updated' | 'read' | 'deleted';
      notificationId?: string;
      notificationType?: NotificationType | string;
      title?: string;
      body?: string;
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
    };

/** @deprecated alias — prefer LiveStreamEvent */
export type NotificationLiveEvent = LiveStreamEvent;

const CHANNEL = 'notifications:live';

type Client = { res: Response; heartbeat: NodeJS.Timeout };

const localClients = new Map<string, Set<Client>>();

let subscriber: Redis | null = null;
let redisReady: Promise<void> | null = null;

function writeSse(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function deliverLocal(userId: string, payload: LiveStreamEvent): void {
  const set = localClients.get(userId);
  if (!set || set.size === 0) return;
  const eventName =
    payload.type === 'message:new' || payload.type === 'message:deleted'
      ? 'message'
      : 'notification';
  for (const client of set) {
    try {
      writeSse(client.res, eventName, payload);
    } catch {
      /* gone */
    }
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
          };
          if (parsed?.userId && parsed.event) {
            deliverLocal(parsed.userId, parsed.event);
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

export function addNotificationStreamClient(userId: string, res: Response): () => void {
  void ensureRedisSub();

  const heartbeat = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch {
      /* ignore */
    }
  }, 25_000);

  const client: Client = { res, heartbeat };
  let set = localClients.get(userId);
  if (!set) {
    set = new Set();
    localClients.set(userId, set);
  }
  set.add(client);

  writeSse(res, 'connected', { ok: true });

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
): Promise<void> {
  deliverLocal(userId, event);

  try {
    await ensureRedisSub();
    await redis.publish(CHANNEL, JSON.stringify({ userId, event }));
  } catch (err) {
    logger.warn('notificationStream publish failed', { err, userId });
  }
}

export async function publishNotificationEventToMany(
  userIds: string[],
  event: LiveStreamEvent,
): Promise<void> {
  const unique = Array.from(new Set(userIds));
  await Promise.all(unique.map((id) => publishNotificationEvent(id, event)));
}
