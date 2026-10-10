import { randomUUID } from 'crypto';
import { ActivityEntityType, FollowTargetType, NotificationType, OutboxEvent, Prisma, UserActivityType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../utils/logger';
import { unreadNotificationsCache } from '../utils/unreadNotificationsCache';
import { publishNotificationEventsToMany } from '../utils/notificationStream';
import { pushService } from '../utils/pushService';

const BATCH_SIZE = 25;
const LEASE_SECONDS = 120;
const POLL_INTERVAL_MS = 1_000;
const MAX_BACKOFF_MS = 60 * 60 * 1_000;

interface ActivityPayload {
  userId: string;
  type: UserActivityType;
  title: string;
  description?: string | null;
  entityType?: ActivityEntityType | null;
  entityId?: string | null;
  metadata?: unknown;
}

interface FollowTargetPayload {
  targetType: FollowTargetType;
  targetId: string;
}

interface FollowedActivityPayload {
  targets: FollowTargetPayload[];
  title: string;
  body: string;
  type: NotificationType;
  data: Record<string, unknown>;
}

function parseActivityPayload(value: unknown): ActivityPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Outbox activity payload must be an object');
  }
  const payload = value as Record<string, unknown>;
  const activityTypes = Object.values(UserActivityType) as string[];
  if (
    typeof payload.userId !== 'string' || !payload.userId ||
    typeof payload.type !== 'string' || !activityTypes.includes(payload.type) ||
    typeof payload.title !== 'string' || !payload.title
  ) {
    throw new Error('Outbox activity payload is missing valid userId, type, or title');
  }
  for (const key of ['description', 'entityType', 'entityId'] as const) {
    if (payload[key] !== undefined && payload[key] !== null && typeof payload[key] !== 'string') {
      throw new Error(`Outbox activity payload field ${key} must be a string or null`);
    }
  }
  if (payload.entityType !== undefined && payload.entityType !== null
    && !Object.values(ActivityEntityType).includes(payload.entityType as ActivityEntityType)) {
    throw new Error('Outbox activity payload field entityType is not a valid ActivityEntityType');
  }
  return payload as unknown as ActivityPayload;
}

function parseFollowedActivityPayload(value: unknown): FollowedActivityPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Followed-activity outbox payload must be an object');
  }
  const payload = value as Record<string, unknown>;
  const targetTypes = Object.values(FollowTargetType) as string[];
  const notificationTypes = [
    NotificationType.FOLLOWED_USER_ACTIVITY,
    NotificationType.FOLLOWED_STORE_ACTIVITY,
    NotificationType.FOLLOWED_CATEGORY_ACTIVITY,
  ] as string[];
  if (!Array.isArray(payload.targets) || !payload.targets.every((target) => {
    if (!target || typeof target !== 'object' || Array.isArray(target)) return false;
    const item = target as Record<string, unknown>;
    return typeof item.targetType === 'string' && targetTypes.includes(item.targetType)
      && typeof item.targetId === 'string' && item.targetId.length > 0;
  })) throw new Error('Followed-activity outbox targets are invalid');
  if (typeof payload.title !== 'string' || !payload.title || typeof payload.body !== 'string') {
    throw new Error('Followed-activity outbox title/body are invalid');
  }
  if (typeof payload.type !== 'string' || !notificationTypes.includes(payload.type)) {
    throw new Error('Followed-activity outbox notification type is invalid');
  }
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    throw new Error('Followed-activity outbox data must be an object');
  }
  return payload as unknown as FollowedActivityPayload;
}

interface SavedSearchMatchPayload {
  adId: string;
  adTitle: string;
  matches: Array<{ userId: string; savedSearchId: string; label: string }>;
}

function parseSavedSearchMatchPayload(value: unknown): SavedSearchMatchPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Saved-search outbox payload must be an object');
  }
  const payload = value as Record<string, unknown>;
  if (typeof payload.adId !== 'string' || !payload.adId || typeof payload.adTitle !== 'string' || !payload.adTitle) {
    throw new Error('Saved-search outbox payload is missing adId or adTitle');
  }
  if (!Array.isArray(payload.matches) || !payload.matches.every((match) => {
    if (!match || typeof match !== 'object' || Array.isArray(match)) return false;
    const row = match as Record<string, unknown>;
    return typeof row.userId === 'string' && row.userId.length > 0
      && typeof row.savedSearchId === 'string' && row.savedSearchId.length > 0
      && typeof row.label === 'string';
  })) throw new Error('Saved-search outbox matches are invalid');
  return payload as unknown as SavedSearchMatchPayload;
}

function preferenceAllowsSavedSearch(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const preferences = value as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(preferences, 'savedSearch')
    ? Boolean(preferences.savedSearch)
    : true;
}

async function processSavedSearchMatchEvent(event: OutboxEvent, workerId: string): Promise<void> {
  const payload = parseSavedSearchMatchPayload(event.payload);
  const created = await prisma.$transaction(async (tx) => {
    const userIds = Array.from(new Set(payload.matches.map((match) => match.userId)));
    const users = userIds.length
      ? await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, notificationPreferences: true } })
      : [];
    const allowed = new Set(users.filter((user) => preferenceAllowsSavedSearch(user.notificationPreferences)).map((user) => user.id));
    const eligibleMatches = payload.matches.filter((match) => allowed.has(match.userId));
    const title = 'إعلان جديد يطابق بحثك المحفوظ';
    const inserted = eligibleMatches.length
      ? await tx.notification.createManyAndReturn({
          data: eligibleMatches.map((match) => ({
            userId: match.userId,
            type: NotificationType.SAVED_SEARCH_MATCH,
            title,
            body: `\"${payload.adTitle}\" يطابق بحثك المحفوظ \"${match.label}\"`,
            data: { adId: payload.adId, savedSearchId: match.savedSearchId } as Prisma.InputJsonValue,
            idempotencyKey: `outbox:${event.id}:saved-search:${match.savedSearchId}:recipient:${match.userId}`,
          })),
          skipDuplicates: true,
          select: { id: true, userId: true, type: true, title: true, body: true, data: true },
        })
      : [];
    const searchIds = Array.from(new Set(payload.matches.map((match) => match.savedSearchId)));
    if (searchIds.length) {
      await tx.savedSearch.updateMany({ where: { id: { in: searchIds } }, data: { lastNotifiedAt: new Date() } });
    }
    const acknowledged = await tx.outboxEvent.updateMany({
      where: { id: event.id, lockedBy: workerId, processedAt: null },
      data: { processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
    });
    if (acknowledged.count !== 1) throw new Error('Outbox lease lost before saved-search acknowledgement');
    return inserted;
  });

  if (!created.length) return;
  const recipientIds = Array.from(new Set(created.map((row) => row.userId)));
  for (let i = 0; i < recipientIds.length; i += 50) {
    await Promise.all(recipientIds.slice(i, i + 50).map((userId) => unreadNotificationsCache.invalidate(userId)));
  }
  try {
    void publishNotificationEventsToMany(created.map((row) => ({
      userId: row.userId,
      event: {
        type: 'notification' as const,
        action: 'created' as const,
        notificationId: row.id,
        notificationType: row.type,
        title: row.title,
        body: row.body,
        data: asLiveData(row.data),
      },
    }))).catch((error) => logger.warn('Saved-search outbox SSE publish failed after durable commit', { eventId: event.id, error }));
  } catch (error) {
    logger.warn('Saved-search outbox SSE publish failed after durable commit', { eventId: event.id, error });
  }
  try {
    void Promise.all(created.map((row) => {
      const data = asLiveData(row.data);
      return pushService.notifyUser(row.userId, {
        title: row.title,
        body: row.body,
        url: data?.adId ? `/ads/${String(data.adId)}` : '/',
        tag: `saved-search-${String(data?.savedSearchId ?? event.id)}`,
        type: row.type,
      });
    })).catch((error) => logger.warn('Saved-search outbox push failed after durable commit', { eventId: event.id, error }));
  } catch (error) {
    logger.warn('Saved-search outbox push failed after durable commit', { eventId: event.id, error });
  }
}

async function claimBatch(workerId: string): Promise<OutboxEvent[]> {
  // One atomic statement across workers. Expired leases make abandoned work
  // claimable after a process crash; SKIP LOCKED prevents simultaneous claims.
  return prisma.$queryRaw<OutboxEvent[]>`
    WITH candidates AS (
      SELECT "id"
      FROM "outbox_events"
      WHERE "processedAt" IS NULL
        AND "availableAt" <= NOW()
        AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - (${LEASE_SECONDS} * INTERVAL '1 second'))
      ORDER BY "createdAt" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "outbox_events" AS event
    SET "lockedAt" = NOW(), "lockedBy" = ${workerId}, "attempts" = event."attempts" + 1
    FROM candidates
    WHERE event."id" = candidates."id"
    RETURNING event.*
  `;
}

async function processActivityEvent(event: OutboxEvent, workerId: string): Promise<void> {
  const payload = parseActivityPayload(event.payload);
  await prisma.$transaction(async (tx) => {
    await tx.userActivity.createMany({
      data: [{
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        description: payload.description ?? null,
        entityType: payload.entityType ?? null,
        entityId: payload.entityId ?? null,
        ...(payload.metadata !== undefined ? { metadata: payload.metadata as Prisma.InputJsonValue } : {}),
        idempotencyKey: `outbox:${event.idempotencyKey}`,
      }],
      skipDuplicates: true,
    });
    const acknowledged = await tx.outboxEvent.updateMany({
      where: { id: event.id, lockedBy: workerId, processedAt: null },
      data: { processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
    });
    if (acknowledged.count !== 1) throw new Error('Outbox lease lost before acknowledgement');
  });
}

function preferenceAllowsFollowUpdates(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const preferences = value as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(preferences, 'followUpdates')
    ? Boolean(preferences.followUpdates)
    : true;
}

function asLiveData(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function processFollowedActivityEvent(event: OutboxEvent, workerId: string): Promise<void> {
  const payload = parseFollowedActivityPayload(event.payload);
  const created = await prisma.$transaction(async (tx) => {
    const targetConditions = payload.targets.map((target) => ({
      targetType: target.targetType,
      targetId: target.targetId,
    }));
    const followers = targetConditions.length
      ? await tx.follow.findMany({ where: { OR: targetConditions }, select: { followerId: true } })
      : [];
    const candidateIds = Array.from(new Set(followers.map((row) => row.followerId)));
    const users = candidateIds.length
      ? await tx.user.findMany({ where: { id: { in: candidateIds } }, select: { id: true, notificationPreferences: true } })
      : [];
    const allowedIds = users
      .filter((user) => preferenceAllowsFollowUpdates(user.notificationPreferences))
      .map((user) => user.id);

    // Notification rows and event acknowledgement commit together. A worker
    // crash cannot leave a committed notification with an unacknowledged event,
    // and the unique per-recipient key is a second line of defence on retries.
    const inserted = allowedIds.length
      ? await tx.notification.createManyAndReturn({
          data: allowedIds.map((userId) => ({
            userId,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            data: payload.data as Prisma.InputJsonValue,
            idempotencyKey: `outbox:${event.id}:recipient:${userId}`,
          })),
          skipDuplicates: true,
          select: { id: true, userId: true, type: true, title: true, body: true, data: true },
        })
      : [];
    const acknowledged = await tx.outboxEvent.updateMany({
      where: { id: event.id, lockedBy: workerId, processedAt: null },
      data: { processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
    });
    if (acknowledged.count !== 1) throw new Error('Outbox lease lost before notification acknowledgement');
    return inserted;
  });

  if (!created.length) return;
  const recipientIds = Array.from(new Set(created.map((row) => row.userId)));
  // These are post-commit delivery hints; durable notification rows remain
  // authoritative if Redis/SSE/Push is unavailable at this point.
  for (let i = 0; i < recipientIds.length; i += 50) {
    await Promise.all(recipientIds.slice(i, i + 50).map((userId) => unreadNotificationsCache.invalidate(userId)));
  }
  try {
    void publishNotificationEventsToMany(created.map((row) => ({
      userId: row.userId,
      event: {
        type: 'notification' as const,
        action: 'created' as const,
        notificationId: row.id,
        notificationType: row.type,
        title: row.title,
        body: row.body,
        data: asLiveData(row.data),
      },
    }))).catch((error) => logger.warn('Outbox notification SSE publish failed after durable commit', { eventId: event.id, error }));
  } catch (error) {
    logger.warn('Outbox notification SSE publish failed after durable commit', { eventId: event.id, error });
  }
  try {
    void pushService.notifyUsers(recipientIds, {
      title: payload.title,
      body: payload.body,
      url: '/?feed=following',
      tag: `followed-activity-${event.aggregateId}`,
      type: payload.type,
    }).catch((error) => logger.warn('Outbox notification push failed after durable commit', { eventId: event.id, error }));
  } catch (error) {
    logger.warn('Outbox notification push failed after durable commit', { eventId: event.id, error });
  }
}

async function markRetry(event: OutboxEvent, workerId: string, error: unknown): Promise<void> {
  const exponent = Math.min(Math.max(event.attempts - 1, 0), 12);
  const delayMs = Math.min(1_000 * (2 ** exponent), MAX_BACKOFF_MS);
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  await prisma.outboxEvent.updateMany({
    where: { id: event.id, lockedBy: workerId, processedAt: null },
    data: {
      lockedAt: null,
      lockedBy: null,
      availableAt: new Date(Date.now() + delayMs),
      lastError: message,
    },
  });
  logger.error('Outbox event processing failed; scheduled retry', {
    eventId: event.id,
    eventType: event.eventType,
    attempts: event.attempts,
    delayMs,
    error,
  });
}

export async function processOutboxBatch(workerId = `outbox-${process.pid}-${randomUUID()}`): Promise<number> {
  const events = await claimBatch(workerId);
  for (const event of events) {
    try {
      if (event.eventType === 'USER_ACTIVITY_RECORD') await processActivityEvent(event, workerId);
      else if (event.eventType === 'FOLLOWED_ACTIVITY_NOTIFICATION') await processFollowedActivityEvent(event, workerId);
      else if (event.eventType === 'SAVED_SEARCH_MATCH_NOTIFICATION') await processSavedSearchMatchEvent(event, workerId);
      else throw new Error(`Unsupported outbox event type: ${event.eventType}`);
    } catch (error) {
      await markRetry(event, workerId, error);
    }
  }
  return events.length;
}

export async function runOutboxWorker(shouldStop: () => boolean = () => false): Promise<void> {
  logger.info('Transactional outbox worker started');
  while (!shouldStop()) {
    const count = await processOutboxBatch().catch((error) => {
      logger.error('Outbox batch claim failed', { error });
      return 0;
    });
    if (count === 0) await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
