import { randomUUID } from 'crypto';
import {
  ActivityEntityType,
  FollowTargetType,
  NotificationType,
  OutboxEvent,
  Prisma,
  UserActivityType,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../utils/logger';
import { unreadNotificationsCache } from '../utils/unreadNotificationsCache';
import { publishNotificationEventsToMany } from '../utils/notificationStream';
import { pushService, type PushPayload } from '../utils/pushService';
import { pushSubscriptionsRepository } from '../utils/pushSubscriptionsRepository';
import { fcmDeviceTokensRepository } from '../utils/fcmDeviceTokensRepository';
import { fcmPushService } from '../utils/fcmPushService';
import { env } from '../../config/env';
import { bumpGeneration } from '../utils/swrCache';

// Claim one event at a time: leasing a batch and then processing it serially lets
// later events' leases expire while they wait behind a slow high-fan-out event.
const BATCH_SIZE = 1;
const LEASE_SECONDS = 120;
const LEASE_HEARTBEAT_INTERVAL_MS = 30_000;
// Idle polling backoff: 1s → 2s → 5s → 10s (max). Resets to 1s on any job.
const IDLE_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000];
const HEALTH_REPORT_INTERVAL_MS = 60_000;
const OUTBOX_RETENTION_INTERVAL_MS = 10 * 60_000;
const OUTBOX_PROCESSED_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const OUTBOX_RETENTION_BATCH_SIZE = 500;
// Completed push dispatches (and, via FK cascade, their per-device targets) are
// operational ledgers, not user data. Keep them long enough for investigation.
const PUSH_DISPATCH_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
// Health anomalies for permanent push failures only count recent completions;
// otherwise one old failure would warn every minute until it is pruned.
const PUSH_FAILURE_HEALTH_WINDOW_MS = 24 * 60 * 60 * 1_000;
const STALE_EVENT_AGE_MS = 5 * 60 * 1_000;
const HIGH_ATTEMPT_THRESHOLD = 10;
// Quarantine poison events after bounded retries, but preserve their payload for operator recovery.
const MAX_PROCESSING_ATTEMPTS = 25;
const MAX_BACKOFF_MS = 60 * 60 * 1_000;
/** Bound post-commit work so high-fan-out events cannot create an unbounded promise burst. */
const POST_COMMIT_BATCH_SIZE = 50;
const PUSH_DISPATCH_MAX_PER_POLL = 10;
const PUSH_DISPATCH_MAX_ATTEMPTS = 25;

async function invalidateUnreadCachesBestEffort(userIds: string[], eventId: string): Promise<void> {
  const uniqueIds = Array.from(new Set(userIds));
  for (let i = 0; i < uniqueIds.length; i += POST_COMMIT_BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + POST_COMMIT_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(userId => unreadNotificationsCache.invalidate(userId))
    );
    const failures = results.filter(result => result.status === 'rejected').length;
    if (failures > 0) {
      // Cache invalidation is a post-commit hint. It must not prevent SSE/push
      // delivery after the durable notification rows and outbox acknowledgement committed.
      logger.warn('Outbox unread-cache invalidation partially failed after durable commit', {
        eventId,
        batchSize: batch.length,
        failures,
      });
    }
  }
}

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
    typeof payload.userId !== 'string' ||
    !payload.userId ||
    typeof payload.type !== 'string' ||
    !activityTypes.includes(payload.type) ||
    typeof payload.title !== 'string' ||
    !payload.title
  ) {
    throw new Error('Outbox activity payload is missing valid userId, type, or title');
  }
  for (const key of ['description', 'entityType', 'entityId'] as const) {
    if (payload[key] !== undefined && payload[key] !== null && typeof payload[key] !== 'string') {
      throw new Error(`Outbox activity payload field ${key} must be a string or null`);
    }
  }
  if (
    payload.entityType !== undefined &&
    payload.entityType !== null &&
    !Object.values(ActivityEntityType).includes(payload.entityType as ActivityEntityType)
  ) {
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
  if (
    !Array.isArray(payload.targets) ||
    !payload.targets.every(target => {
      if (!target || typeof target !== 'object' || Array.isArray(target)) return false;
      const item = target as Record<string, unknown>;
      return (
        typeof item.targetType === 'string' &&
        targetTypes.includes(item.targetType) &&
        typeof item.targetId === 'string' &&
        item.targetId.length > 0
      );
    })
  )
    throw new Error('Followed-activity outbox targets are invalid');
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
  if (
    typeof payload.adId !== 'string' ||
    !payload.adId ||
    typeof payload.adTitle !== 'string' ||
    !payload.adTitle
  ) {
    throw new Error('Saved-search outbox payload is missing adId or adTitle');
  }
  if (
    !Array.isArray(payload.matches) ||
    !payload.matches.every(match => {
      if (!match || typeof match !== 'object' || Array.isArray(match)) return false;
      const row = match as Record<string, unknown>;
      return (
        typeof row.userId === 'string' &&
        row.userId.length > 0 &&
        typeof row.savedSearchId === 'string' &&
        row.savedSearchId.length > 0 &&
        typeof row.label === 'string'
      );
    })
  )
    throw new Error('Saved-search outbox matches are invalid');
  return payload as unknown as SavedSearchMatchPayload;
}

function preferenceAllowsSavedSearch(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return true;
  const preferences = value as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(preferences, 'savedSearch')
    ? Boolean(preferences.savedSearch)
    : true;
}


interface GoOutboxNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: unknown;
}

interface GoOutboxResult {
  eventId: string;
  eventType: string;
  processed: true;
  created: GoOutboxNotification[];
}

function isGoOutboxNotification(value: unknown): value is GoOutboxNotification {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && typeof row.userId === 'string' &&
    typeof row.type === 'string' && typeof row.title === 'string' &&
    typeof row.body === 'string' &&
    (row.data === null || (typeof row.data === 'object' && !Array.isArray(row.data)));
}

function isGoOutboxResult(value: unknown, event: OutboxEvent): value is GoOutboxResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.eventId === event.id && row.eventType === event.eventType && row.processed === true &&
    Array.isArray(row.created) && row.created.every(isGoOutboxNotification);
}

/**
 * A Go call can time out after the remote transaction has begun. Both Go and
 * this fallback acquire the same transaction-scoped event lock, so Express
 * never races a still-running Go transaction when deciding to fall back.
 */
async function tryAcquireOutboxExecutionLock(
  tx: Prisma.TransactionClient,
  eventId: string
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_xact_lock(
      hashtextextended(${'marketplat-outbox:' + eventId}, 0)
    ) AS locked
  `;
  return rows[0]?.locked === true;
}

/**
 * Ask Go to perform the transactional database part of selected outbox events.
 * Express retains the lease heartbeat and all post-commit Redis/SSE/provider
 * work. When the Go response is ambiguous, inspect the durable event row before
 * deciding whether the existing Express processor should run.
 */
async function tryExecuteOutboxEventInGo(
  event: OutboxEvent,
  workerId: string
): Promise<GoOutboxResult | null> {
  const baseUrl = process.env.GO_WORKER_URL?.trim().replace(/\/+$/, '');
  const token = process.env.GO_WORKER_TOKEN?.trim();
  if (!baseUrl || !token) return null;

  try {
    const response = await fetch(`${baseUrl}/internal/outbox/execute-event`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ eventId: event.id, workerId }),
      signal: AbortSignal.timeout(95_000),
    });

    if (response.ok) {
      const result: unknown = await response.json().catch(() => undefined);
      if (isGoOutboxResult(result, event)) return result;
      logger.warn('Go outbox processor returned an invalid success payload; checking durable event state', {
        eventId: event.id,
        eventType: event.eventType,
      });
    } else {
      logger.warn('Go outbox processor failed; checking durable event state before Express fallback', {
        eventId: event.id,
        eventType: event.eventType,
        status: response.status,
      });
    }
  } catch (error) {
    logger.warn('Go outbox processor unavailable; checking durable event state before Express fallback', {
      eventId: event.id,
      eventType: event.eventType,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
  }

  const state = await prisma.outboxEvent.findUnique({
    where: { id: event.id },
    select: { processedAt: true, lockedBy: true },
  });
  if (!state) throw new Error(`Outbox event ${event.id} disappeared while processing`);
  if (state.processedAt) {
    const created = event.eventType === 'USER_ACTIVITY_RECORD'
      ? []
      : await prisma.notification.findMany({
          where: { idempotencyKey: { startsWith: `outbox:${event.id}:` } },
          select: { id: true, userId: true, type: true, title: true, body: true, data: true },
        });
    return {
      eventId: event.id,
      eventType: event.eventType,
      processed: true,
      created: created.map(row => ({ ...row, data: row.data })),
    };
  }
  if (state.lockedBy !== workerId) {
    throw new Error(`Outbox event ${event.id} lease is no longer owned by this worker`);
  }
  return null;
}

async function publishOutboxNotifications(
  created: GoOutboxNotification[],
  eventId: string,
  label: string
): Promise<void> {
  if (created.length === 0) return;
  const recipientIds = Array.from(new Set(created.map(row => row.userId)));
  await invalidateUnreadCachesBestEffort(recipientIds, eventId);
  try {
    void publishNotificationEventsToMany(
      created.map(row => ({
        userId: row.userId,
        event: {
          type: 'notification' as const,
          action: 'created' as const,
          notificationId: row.id,
          notificationType: row.type as NotificationType,
          title: row.title,
          body: row.body,
          data: asLiveData(row.data),
        },
      }))
    ).catch(error => logger.warn(`${label} outbox SSE publish failed after durable commit`, {
      eventId,
      error,
    }));
  } catch (error) {
    logger.warn(`${label} outbox SSE publish failed after durable commit`, { eventId, error });
  }
}

async function processSavedSearchMatchEvent(event: OutboxEvent, workerId: string): Promise<void> {
  const payload = parseSavedSearchMatchPayload(event.payload);
  const goResult = await tryExecuteOutboxEventInGo(event, workerId);
  if (goResult) {
    await publishOutboxNotifications(goResult.created, event.id, 'Saved-search');
    return;
  }
  const created = await prisma.$transaction(async tx => {
    if (!(await tryAcquireOutboxExecutionLock(tx, event.id))) return [];
    const userIds = Array.from(new Set(payload.matches.map(match => match.userId)));
    const users = userIds.length
      ? await tx.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, notificationPreferences: true },
        })
      : [];
    const allowed = new Set(
      users
        .filter(user => preferenceAllowsSavedSearch(user.notificationPreferences))
        .map(user => user.id)
    );
    const eligibleMatches = payload.matches.filter(match => allowed.has(match.userId));
    const title = 'إعلان جديد يطابق بحثك المحفوظ';
    const inserted = eligibleMatches.length
      ? await tx.notification.createManyAndReturn({
          data: eligibleMatches.map(match => ({
            userId: match.userId,
            type: NotificationType.SAVED_SEARCH_MATCH,
            title,
            body: `\"${payload.adTitle}\" يطابق بحثك المحفوظ \"${match.label}\"`,
            data: {
              adId: payload.adId,
              savedSearchId: match.savedSearchId,
            } as Prisma.InputJsonValue,
            idempotencyKey: `outbox:${event.id}:saved-search:${match.savedSearchId}:recipient:${match.userId}`,
          })),
          skipDuplicates: true,
          select: { id: true, userId: true, type: true, title: true, body: true, data: true },
        })
      : [];
    if (inserted.length) {
      await tx.notificationPushDispatch.createMany({
        data: inserted.map(row => {
          const data = asLiveData(row.data);
          const savedSearchId = data?.savedSearchId ? String(data.savedSearchId) : event.id;
          const pushPayload: PushPayload = {
            title: row.title,
            body: row.body,
            url: data?.adId ? `/ads/${String(data.adId)}` : '/',
            tag: `saved-search-${savedSearchId}`,
            type: row.type,
          };
          return {
            notificationId: row.id,
            userId: row.userId,
            payload: pushPayload as unknown as Prisma.InputJsonValue,
            idempotencyKey: `notification-push:${row.id}`,
          };
        }),
        skipDuplicates: true,
      });
    }
    const searchIds = Array.from(new Set(payload.matches.map(match => match.savedSearchId)));
    if (searchIds.length) {
      await tx.savedSearch.updateMany({
        where: { id: { in: searchIds } },
        data: { lastNotifiedAt: new Date() },
      });
    }
    const acknowledged = await tx.outboxEvent.updateMany({
      where: { id: event.id, lockedBy: workerId, processedAt: null },
      data: { processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
    });
    if (acknowledged.count !== 1)
      throw new Error('Outbox lease lost before saved-search acknowledgement');
    return inserted;
  });

  await publishOutboxNotifications(
    created.map(row => ({ ...row, data: row.data })),
    event.id,
    'Saved-search'
  );
}

/**
 * Keep the active event lease alive during slow database/network work. The
 * conditional update is also a cheap ownership check; acknowledgement still
 * verifies lockedBy inside the event's transaction, so a lost lease cannot
 * commit transactional side effects.
 */
async function withLeaseHeartbeat<T>(
  event: OutboxEvent,
  workerId: string,
  work: () => Promise<T>
): Promise<T> {
  let heartbeatInFlight = false;
  const timer = setInterval(() => {
    if (heartbeatInFlight) return;
    heartbeatInFlight = true;
    // PostgreSQL clock: lease expiry in claimBatch uses NOW(), so renewal must too.
    void prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "outbox_events" SET "lockedAt" = NOW()
      WHERE "id" = ${event.id} AND "lockedBy" = ${workerId} AND "processedAt" IS NULL
      RETURNING "id"
    `
      .then(async rows => {
        if (rows.length !== 1) {
          // A delegated Go transaction may have committed the acknowledgement
          // just before this heartbeat reached PostgreSQL. That is completion,
          // not a stolen lease, so avoid a false-positive ownership warning.
          const state = await prisma.outboxEvent.findUnique({
            where: { id: event.id },
            select: { processedAt: true },
          });
          if (state?.processedAt) {
            clearInterval(timer);
            return;
          }
          logger.warn('Outbox lease heartbeat found that event ownership was lost', {
            eventId: event.id,
            eventType: event.eventType,
            workerId,
          });
          clearInterval(timer);
        }
      })
      .catch(error => {
        // Do not falsely extend a lease when the database did not confirm it.
        // Event acknowledgement remains ownership-checked and will fail safely.
        logger.warn('Outbox lease heartbeat failed', {
          eventId: event.id,
          eventType: event.eventType,
          error,
        });
      })
      .finally(() => {
        heartbeatInFlight = false;
      });
  }, LEASE_HEARTBEAT_INTERVAL_MS);
  try {
    return await work();
  } finally {
    clearInterval(timer);
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
        AND "deadLetterAt" IS NULL
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
  const goResult = await tryExecuteOutboxEventInGo(event, workerId);
  if (goResult) return;
  await prisma.$transaction(async tx => {
    if (!(await tryAcquireOutboxExecutionLock(tx, event.id))) return;
    await tx.userActivity.createMany({
      data: [
        {
          userId: payload.userId,
          type: payload.type,
          title: payload.title,
          description: payload.description ?? null,
          entityType: payload.entityType ?? null,
          entityId: payload.entityId ?? null,
          ...(payload.metadata !== undefined
            ? { metadata: payload.metadata as Prisma.InputJsonValue }
            : {}),
          idempotencyKey: `outbox:${event.idempotencyKey}`,
        },
      ],
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
    ? (value as Record<string, unknown>)
    : null;
}

async function processFollowedActivityEvent(event: OutboxEvent, workerId: string): Promise<void> {
  const payload = parseFollowedActivityPayload(event.payload);
  const goResult = await tryExecuteOutboxEventInGo(event, workerId);
  if (goResult) {
    await publishOutboxNotifications(goResult.created, event.id, 'Followed-activity');
    return;
  }
  const created = await prisma.$transaction(async tx => {
    if (!(await tryAcquireOutboxExecutionLock(tx, event.id))) return [];
    const targetConditions = payload.targets.map(target => ({
      targetType: target.targetType,
      targetId: target.targetId,
    }));
    const followers = targetConditions.length
      ? await tx.follow.findMany({ where: { OR: targetConditions }, select: { followerId: true } })
      : [];
    const candidateIds = Array.from(new Set(followers.map(row => row.followerId)));
    const users = candidateIds.length
      ? await tx.user.findMany({
          where: { id: { in: candidateIds } },
          select: { id: true, notificationPreferences: true },
        })
      : [];
    const allowedIds = users
      .filter(user => preferenceAllowsFollowUpdates(user.notificationPreferences))
      .map(user => user.id);

    // Notification rows and event acknowledgement commit together. A worker
    // crash cannot leave a committed notification with an unacknowledged event,
    // and the unique per-recipient key is a second line of defence on retries.
    const inserted = allowedIds.length
      ? await tx.notification.createManyAndReturn({
          data: allowedIds.map(userId => ({
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
    if (inserted.length) {
      await tx.notificationPushDispatch.createMany({
        data: inserted.map(row => ({
          notificationId: row.id,
          userId: row.userId,
          payload: {
            title: row.title,
            body: row.body,
            url: '/?feed=following',
            tag: `followed-activity-${event.aggregateId}`,
            type: row.type,
          } as unknown as Prisma.InputJsonValue,
          idempotencyKey: `notification-push:${row.id}`,
        })),
        skipDuplicates: true,
      });
    }
    const acknowledged = await tx.outboxEvent.updateMany({
      where: { id: event.id, lockedBy: workerId, processedAt: null },
      data: { processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
    });
    if (acknowledged.count !== 1)
      throw new Error('Outbox lease lost before notification acknowledgement');
    return inserted;
  });

  await publishOutboxNotifications(
    created.map(row => ({ ...row, data: row.data })),
    event.id,
    'Followed-activity'
  );
}

interface NotificationPushDispatchRow {
  id: string;
  userId: string;
  payload: unknown;
  attempts: number;
  targetsSeededAt: Date | null;
}

function parsePushDispatchPayload(value: unknown): PushPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Notification push dispatch payload must be an object');
  }
  const payload = value as Record<string, unknown>;
  if (typeof payload.title !== 'string' || !payload.title || typeof payload.body !== 'string') {
    throw new Error('Notification push dispatch payload is missing title/body');
  }
  for (const key of ['url', 'tag', 'image', 'type'] as const) {
    if (payload[key] !== undefined && payload[key] !== null && typeof payload[key] !== 'string') {
      throw new Error(`Notification push dispatch payload field ${key} must be a string`);
    }
  }
  if (payload.urgent !== undefined && typeof payload.urgent !== 'boolean') {
    throw new Error('Notification push dispatch payload field urgent must be boolean');
  }
  return payload as unknown as PushPayload;
}

async function claimPushDispatch(workerId: string): Promise<NotificationPushDispatchRow | null> {
  const rows = await prisma.$queryRaw<NotificationPushDispatchRow[]>`
    WITH candidate AS (
      SELECT "id" FROM "notification_push_dispatches"
      WHERE "processedAt" IS NULL AND "deadLetterAt" IS NULL
        AND "availableAt" <= NOW()
        AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - (${LEASE_SECONDS} * INTERVAL '1 second'))
      ORDER BY "createdAt" ASC
      LIMIT 1 FOR UPDATE SKIP LOCKED
    )
    UPDATE "notification_push_dispatches" AS dispatch
    SET "lockedAt" = NOW(), "lockedBy" = ${workerId}, "attempts" = dispatch."attempts" + 1
    FROM candidate WHERE dispatch."id" = candidate."id"
    RETURNING dispatch."id", dispatch."userId", dispatch."payload", dispatch."attempts", dispatch."targetsSeededAt"
  `;
  return rows[0] ?? null;
}

/** Renew the dispatch lease independently from its per-device target leases.
 * A target lease prevents two workers from sending to the same device at once;
 * this lease prevents another worker from reclaiming the dispatch while the
 * current worker is still resolving provider outcomes and persisting the summary.
 */
function startPushDispatchLeaseHeartbeat(dispatchId: string, workerId: string): () => void {
  let heartbeatInFlight = false;
  let stopped = false;
  const timer = setInterval(() => {
    if (heartbeatInFlight || stopped) return;
    heartbeatInFlight = true;
    // Use PostgreSQL's clock, not the worker host clock: lease expiry is evaluated
    // with NOW() in claimPushDispatch, so app/database clock skew must not shorten
    // or artificially extend this lease.
    void prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "notification_push_dispatches"
      SET "lockedAt" = NOW()
      WHERE "id" = ${dispatchId} AND "lockedBy" = ${workerId}
        AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
      RETURNING "id"
    `
      .then(rows => {
        if (rows.length !== 1) {
          logger.warn('Push dispatch lease heartbeat found that dispatch ownership was lost', {
            dispatchId,
            workerId,
          });
          stopped = true;
          clearInterval(timer);
        }
      })
      .catch(error => {
        // A failed heartbeat does not extend the lease. The final acknowledgement
        // remains conditional on lockedBy, and a later worker may recover after expiry.
        logger.warn('Push dispatch lease heartbeat failed', { dispatchId, workerId, error });
      })
      .finally(() => {
        heartbeatInFlight = false;
      });
  }, LEASE_HEARTBEAT_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

const PUSH_TARGET_MAX_ATTEMPTS = 12;
const PUSH_TARGET_BATCH_SIZE = 50;

async function seedPushDeliveryTargets(
  dispatch: NotificationPushDispatchRow,
  workerId: string
): Promise<void> {
  if (dispatch.targetsSeededAt) return;
  // Snapshot the registered device row IDs once. Secrets (endpoint/token) never
  // enter this ledger; each attempt resolves the current row by id + userId.
  const [subscriptions, tokens] = await Promise.all([
    pushSubscriptionsRepository.findManyByUserId(dispatch.userId),
    fcmDeviceTokensRepository.findManyByUserId(dispatch.userId),
  ]);
  await prisma.notificationPushDeliveryTarget.createMany({
    data: [
      ...subscriptions.map(row => ({
        dispatchId: dispatch.id,
        channel: 'WEB_PUSH',
        targetId: row.id,
      })),
      ...tokens.map(row => ({ dispatchId: dispatch.id, channel: 'FCM', targetId: row.id })),
    ],
    skipDuplicates: true,
  });
  const seeded = await prisma.notificationPushDispatch.updateMany({
    where: { id: dispatch.id, lockedBy: workerId, processedAt: null, deadLetterAt: null },
    data: { targetsSeededAt: new Date() },
  });
  if (seeded.count !== 1)
    throw new Error('Push dispatch lease lost while seeding delivery targets');
}

interface ClaimedPushDeliveryTarget {
  id: string;
  dispatchId: string;
  channel: string;
  targetId: string;
  status: string;
  attempts: number;
  availableAt: Date;
}

async function claimPushDeliveryTargets(
  dispatchId: string,
  workerId: string
): Promise<ClaimedPushDeliveryTarget[]> {
  return prisma.$queryRaw<ClaimedPushDeliveryTarget[]>`
    WITH candidates AS (
      SELECT "id" FROM "notification_push_delivery_targets"
      WHERE "dispatchId" = ${dispatchId} AND "status" = 'PENDING'
        AND "availableAt" <= NOW()
        AND "attempts" < ${PUSH_TARGET_MAX_ATTEMPTS}
        AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - (${LEASE_SECONDS} * INTERVAL '1 second'))
      ORDER BY "createdAt" ASC
      LIMIT ${PUSH_TARGET_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "notification_push_delivery_targets" AS target
    SET "lockedAt" = NOW(), "lockedBy" = ${workerId}, "attempts" = target."attempts" + 1
    FROM candidates
    WHERE target."id" = candidates."id"
    RETURNING target."id", target."dispatchId", target."channel", target."targetId",
      target."status", target."attempts", target."availableAt"
  `;
}

async function withPushTargetLeaseHeartbeat<T>(
  dispatchId: string,
  workerId: string,
  work: () => Promise<T>
): Promise<T> {
  let heartbeatInFlight = false;
  const timer = setInterval(() => {
    if (heartbeatInFlight) return;
    heartbeatInFlight = true;
    // Keep lease renewal on the same database clock used by target-claim expiry.
    void prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "notification_push_delivery_targets" AS target
      SET "lockedAt" = NOW()
      WHERE target."dispatchId" = ${dispatchId} AND target."status" = 'PENDING'
        AND target."lockedBy" = ${workerId}
        AND EXISTS (
          SELECT 1 FROM "notification_push_dispatches" AS dispatch
          WHERE dispatch."id" = target."dispatchId" AND dispatch."lockedBy" = ${workerId}
            AND dispatch."processedAt" IS NULL AND dispatch."deadLetterAt" IS NULL
            AND dispatch."lockedAt" >= NOW() - (${LEASE_SECONDS} * INTERVAL '1 second')
        )
      RETURNING target."id"
    `
      .then(rows => {
        if (rows.length === 0) {
          logger.warn(
            'Push target lease heartbeat stopped because target or parent dispatch ownership was lost',
            { dispatchId, workerId }
          );
          clearInterval(timer);
        }
      })
      .catch(error =>
        logger.warn('Push target lease heartbeat failed', { dispatchId, workerId, error })
      )
      .finally(() => {
        heartbeatInFlight = false;
      });
  }, LEASE_HEARTBEAT_INTERVAL_MS);
  try {
    return await work();
  } finally {
    clearInterval(timer);
  }
}

async function processPushDispatchBatch(): Promise<number> {
  let processed = 0;
  for (let i = 0; i < PUSH_DISPATCH_MAX_PER_POLL; i += 1) {
    const workerId = `push-dispatch-${process.pid}-${randomUUID()}`;
    const dispatch = await claimPushDispatch(workerId);
    if (!dispatch) break;
    const stopDispatchHeartbeat = startPushDispatchLeaseHeartbeat(dispatch.id, workerId);
    try {
      const payload = parsePushDispatchPayload(dispatch.payload);
      const quiet = await pushService.quietHoursDecision(dispatch.userId, payload.urgent);
      if (quiet.blocked && !payload.bypassQuietHours) {
        const quietDelayMs = Math.max(1_000, quiet.resumeInMs ?? 60_000);
        const deferred = await prisma.$queryRaw<Array<{ id: string }>>`
          UPDATE "notification_push_dispatches"
          SET "availableAt" = NOW() + (${quietDelayMs} * INTERVAL '1 millisecond'),
              "attempts" = GREATEST("attempts" - 1, 0), "lockedAt" = NULL, "lockedBy" = NULL
          WHERE "id" = ${dispatch.id} AND "lockedBy" = ${workerId}
            AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
          RETURNING "id"
        `;
        if (deferred.length !== 1)
          logger.warn('Quiet-hours push deferral lost its lease', {
            dispatchId: dispatch.id,
            workerId,
          });
        continue;
      }

      await seedPushDeliveryTargets(dispatch, workerId);
      // Claim each target atomically. Dispatch leases alone are insufficient: if a
      // slow provider call outlives a dispatch lease, a second worker can reclaim
      // the dispatch. Target leases + SKIP LOCKED prevent both workers from sending
      // the same pending target concurrently.
      // Lease expiry must use the same PostgreSQL clock as target claiming. Using
      // Date.now() here could terminalize an active target early (or leave an
      // abandoned target pending) when a worker host clock is skewed.
      await prisma.$executeRaw`
        UPDATE "notification_push_delivery_targets"
        SET "status" = 'FAILED', "processedAt" = NOW(),
            "lastError" = 'Target retry limit reached after abandoned attempts',
            "lockedAt" = NULL, "lockedBy" = NULL
        WHERE "dispatchId" = ${dispatch.id} AND "status" = 'PENDING'
          AND "attempts" >= ${PUSH_TARGET_MAX_ATTEMPTS}
          AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - (${LEASE_SECONDS} * INTERVAL '1 second'))
      `;
      const targets = await claimPushDeliveryTargets(dispatch.id, workerId);
      const outcomes = await withPushTargetLeaseHeartbeat(dispatch.id, workerId, () =>
        Promise.all(
          targets.map(async target => {
            try {
              if (target.channel === 'WEB_PUSH') {
                if (!env.webPush.isConfigured) return { target, outcome: 'unconfigured' as const };
                const outcome = await pushService.sendToSubscriptionForOutbox(
                  target.targetId,
                  dispatch.userId,
                  payload
                );
                return { target, outcome };
              }
              if (target.channel === 'FCM') {
                if (!env.fcm.isConfigured) return { target, outcome: 'unconfigured' as const };
                const token = await fcmDeviceTokensRepository.findByIdForUser(
                  target.targetId,
                  dispatch.userId
                );
                if (!token) return { target, outcome: 'missing' as const };
                const outcome = await fcmPushService.sendToToken(token, payload);
                return { target, outcome };
              }
              return { target, outcome: 'failed' as const };
            } catch (error) {
              logger.warn('Individual push target delivery threw', {
                dispatchId: dispatch.id,
                channel: target.channel,
                targetId: target.targetId,
                error,
              });
              return { target, outcome: 'transient' as const };
            }
          })
        )
      );

      for (const { target, outcome } of outcomes) {
        const attemptedCount = target.attempts;
        if (outcome === 'sent' || outcome === 'gone' || outcome === 'missing') {
          const persisted = await prisma.$queryRaw<Array<{ id: string }>>`
            UPDATE "notification_push_delivery_targets"
            SET "status" = ${outcome === 'sent' ? 'SENT' : 'GONE'}, "processedAt" = NOW(),
                "lastError" = NULL, "lockedAt" = NULL, "lockedBy" = NULL
            WHERE "id" = ${target.id} AND "dispatchId" = ${dispatch.id}
              AND "status" = 'PENDING' AND "lockedBy" = ${workerId}
            RETURNING "id"
          `;
          if (persisted.length !== 1)
            logger.warn(
              'Push target outcome was not persisted because target lease ownership was lost',
              {
                dispatchId: dispatch.id,
                targetId: target.id,
                channel: target.channel,
                workerId,
                outcome,
              }
            );
        } else if (outcome === 'transient' && attemptedCount < PUSH_TARGET_MAX_ATTEMPTS) {
          const retryDelayMs = Math.min(1_000 * 2 ** Math.min(attemptedCount, 12), MAX_BACKOFF_MS);
          const persisted = await prisma.$queryRaw<Array<{ id: string }>>`
            UPDATE "notification_push_delivery_targets"
            SET "availableAt" = NOW() + (${retryDelayMs} * INTERVAL '1 millisecond'),
                "lastError" = 'Transient provider failure', "lockedAt" = NULL, "lockedBy" = NULL
            WHERE "id" = ${target.id} AND "dispatchId" = ${dispatch.id}
              AND "status" = 'PENDING' AND "lockedBy" = ${workerId}
            RETURNING "id"
          `;
          if (persisted.length !== 1)
            logger.warn(
              'Push target retry was not persisted because target lease ownership was lost',
              {
                dispatchId: dispatch.id,
                targetId: target.id,
                channel: target.channel,
                workerId,
              }
            );
        } else {
          const message =
            outcome === 'unconfigured'
              ? `Provider not configured: ${target.channel}`
              : outcome === 'failed'
                ? 'Permanent provider failure'
                : 'Transient retry limit reached';
          const persisted = await prisma.$queryRaw<Array<{ id: string }>>`
            UPDATE "notification_push_delivery_targets"
            SET "status" = 'FAILED', "processedAt" = NOW(), "lastError" = ${message.slice(0, 1000)},
                "lockedAt" = NULL, "lockedBy" = NULL
            WHERE "id" = ${target.id} AND "dispatchId" = ${dispatch.id}
              AND "status" = 'PENDING' AND "lockedBy" = ${workerId}
            RETURNING "id"
          `;
          if (persisted.length !== 1)
            logger.warn(
              'Push target failure was not persisted because target lease ownership was lost',
              {
                dispatchId: dispatch.id,
                targetId: target.id,
                channel: target.channel,
                workerId,
              }
            );
        }
      }

      const [pendingCount, failedCount, totalCount] = await Promise.all([
        prisma.notificationPushDeliveryTarget.count({
          where: { dispatchId: dispatch.id, status: 'PENDING' },
        }),
        prisma.notificationPushDeliveryTarget.count({
          where: { dispatchId: dispatch.id, status: 'FAILED' },
        }),
        prisma.notificationPushDeliveryTarget.count({ where: { dispatchId: dispatch.id } }),
      ]);
      if (pendingCount > 0) {
        const retryError = failedCount > 0 ? `Target failures: ${failedCount}/${totalCount}` : null;
        // Compute the next dispatch time from target rows in PostgreSQL. This avoids
        // mixing worker-host timestamps with the database clock used by target claims.
        const retry = await prisma.$queryRaw<Array<{ id: string }>>`
          UPDATE "notification_push_dispatches" AS dispatch
          SET "availableAt" = COALESCE((
                SELECT MIN(GREATEST(target."availableAt",
                  COALESCE(target."lockedAt" + (${LEASE_SECONDS} * INTERVAL '1 second'), target."availableAt")))
                FROM "notification_push_delivery_targets" AS target
                WHERE target."dispatchId" = dispatch."id" AND target."status" = 'PENDING'
              ), NOW() + INTERVAL '1 second'),
              "lockedAt" = NULL, "lockedBy" = NULL, "lastError" = ${retryError}
          WHERE dispatch."id" = ${dispatch.id} AND dispatch."lockedBy" = ${workerId}
            AND dispatch."processedAt" IS NULL AND dispatch."deadLetterAt" IS NULL
          RETURNING dispatch."id"
        `;
        if (retry.length !== 1)
          logger.warn('Push dispatch retry could not be persisted because the lease was lost', {
            dispatchId: dispatch.id,
            workerId,
          });
        continue;
      }

      // Make the final acknowledgement conditional on the database's current target
      // state, not only on a previously-read count. This closes the check/ack gap if
      // target state changes while the worker is summarizing outcomes.
      const acknowledged = await prisma.$queryRaw<Array<{ id: string }>>`
        UPDATE "notification_push_dispatches" AS dispatch
        SET "processedAt" = NOW(), "lockedAt" = NULL, "lockedBy" = NULL,
            "lastError" = ${failedCount > 0 ? `Target failures: ${failedCount}/${totalCount}` : null}
        WHERE dispatch."id" = ${dispatch.id} AND dispatch."lockedBy" = ${workerId}
          AND dispatch."processedAt" IS NULL AND dispatch."deadLetterAt" IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM "notification_push_delivery_targets" AS target
            WHERE target."dispatchId" = dispatch."id" AND target."status" = 'PENDING'
          )
        RETURNING dispatch."id"
      `;
      if (acknowledged.length !== 1) {
        logger.warn(
          'Push dispatch was not acknowledged because lease ownership was lost or pending targets remain',
          { dispatchId: dispatch.id, workerId }
        );
      } else {
        processed += 1;
        if (failedCount > 0)
          logger.error('Push dispatch completed with per-target failures', {
            dispatchId: dispatch.id,
            failedCount,
            totalCount,
          });
      }
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
      await prisma.notificationPushDeliveryTarget
        .updateMany({
          where: { dispatchId: dispatch.id, status: 'PENDING', lockedBy: workerId },
          data: { lockedAt: null, lockedBy: null },
        })
        .catch(releaseError =>
          logger.warn('Could not release push target leases after dispatch failure', {
            dispatchId: dispatch.id,
            workerId,
            error: releaseError,
          })
        );
      if (dispatch.attempts >= PUSH_DISPATCH_MAX_ATTEMPTS) {
        // Do not quarantine a parent while another worker may still be delivering
        // one of its targets. Otherwise that active target could lose the chance to
        // persist SENT, while its now-dead-lettered parent can never be reclaimed.
        // Parent quarantine and terminalization of abandoned PENDING targets are
        // one SQL statement: either both happen, or neither does.
        const quarantined = await prisma.$queryRaw<
          Array<{ id: string; terminalizedTargetCount: number }>
        >`
          WITH quarantined_dispatch AS (
            UPDATE "notification_push_dispatches" AS dispatch
            SET "deadLetterAt" = NOW(), "lockedAt" = NULL, "lockedBy" = NULL, "lastError" = ${message}
            WHERE dispatch."id" = ${dispatch.id} AND dispatch."lockedBy" = ${workerId}
              AND dispatch."processedAt" IS NULL AND dispatch."deadLetterAt" IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM "notification_push_delivery_targets" AS active_target
                WHERE active_target."dispatchId" = dispatch."id" AND active_target."status" = 'PENDING'
                  AND active_target."lockedAt" IS NOT NULL
                  AND active_target."lockedAt" >= NOW() - (${LEASE_SECONDS} * INTERVAL '1 second')
              )
            RETURNING dispatch."id"
          ), terminalized_targets AS (
            UPDATE "notification_push_delivery_targets" AS target
            SET "status" = 'FAILED', "processedAt" = NOW(),
                "lastError" = 'Parent push dispatch quarantined after bounded retries',
                "lockedAt" = NULL, "lockedBy" = NULL
            FROM quarantined_dispatch AS dispatch
            WHERE target."dispatchId" = dispatch."id" AND target."status" = 'PENDING'
            RETURNING target."id"
          )
          SELECT dispatch."id", (SELECT COUNT(*)::int FROM terminalized_targets) AS "terminalizedTargetCount"
          FROM quarantined_dispatch AS dispatch
        `;
        if (quarantined.length === 1) {
          logger.error('Notification push dispatch quarantined after bounded retries', {
            dispatchId: dispatch.id,
            attempts: dispatch.attempts,
            error: message,
            terminalizedTargetCount: quarantined[0].terminalizedTargetCount,
          });
        } else {
          // An unexpired target lease means delivery may still be in flight. Keep the
          // parent recoverable and retry soon; the next attempt can quarantine it once
          // that target has completed or its lease has expired.
          const deferred = await prisma.$queryRaw<Array<{ id: string }>>`
            UPDATE "notification_push_dispatches"
            SET "availableAt" = NOW() + INTERVAL '1 second', "lockedAt" = NULL, "lockedBy" = NULL,
                "lastError" = ${message}
            WHERE "id" = ${dispatch.id} AND "lockedBy" = ${workerId}
              AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
            RETURNING "id"
          `;
          if (deferred.length === 1)
            logger.warn('Push dispatch quarantine deferred while target lease remains active', {
              dispatchId: dispatch.id,
              workerId,
            });
          else
            logger.warn(
              'Push dispatch was not quarantined because this worker no longer owns its lease',
              { dispatchId: dispatch.id, workerId }
            );
        }
      } else {
        const delayMs = Math.min(1_000 * 2 ** Math.min(dispatch.attempts, 12), MAX_BACKOFF_MS);
        const retry = await prisma.$queryRaw<Array<{ id: string }>>`
          UPDATE "notification_push_dispatches"
          SET "availableAt" = NOW() + (${delayMs} * INTERVAL '1 millisecond'),
              "lockedAt" = NULL, "lockedBy" = NULL, "lastError" = ${message}
          WHERE "id" = ${dispatch.id} AND "lockedBy" = ${workerId}
            AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
          RETURNING "id"
        `;
        if (retry.length !== 1)
          logger.warn('Push dispatch retry could not be persisted because the lease was lost', {
            dispatchId: dispatch.id,
            workerId,
          });
      }
    } finally {
      stopDispatchHeartbeat();
    }
  }
  return processed;
}

async function markRetry(event: OutboxEvent, workerId: string, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  if (event.attempts >= MAX_PROCESSING_ATTEMPTS) {
    const quarantined = await prisma.outboxEvent.updateMany({
      where: { id: event.id, lockedBy: workerId, processedAt: null, deadLetterAt: null },
      data: {
        deadLetterAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: message,
      },
    });
    if (quarantined.count !== 1) {
      logger.warn(
        'Outbox event was not quarantined because this worker no longer owns the event lease',
        {
          eventId: event.id,
          eventType: event.eventType,
          workerId,
          attempts: event.attempts,
        }
      );
      return;
    }
    logger.error(
      'Outbox event moved to dead-letter quarantine after bounded retries; payload retained for recovery',
      {
        eventId: event.id,
        eventType: event.eventType,
        attempts: event.attempts,
        deadLetterAt: new Date().toISOString(),
        error,
      }
    );
    return;
  }

  const exponent = Math.min(Math.max(event.attempts - 1, 0), 12);
  const delayMs = Math.min(1_000 * 2 ** exponent, MAX_BACKOFF_MS);
  const updated = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "outbox_events"
    SET "lockedAt" = NULL, "lockedBy" = NULL,
        "availableAt" = NOW() + (${delayMs} * INTERVAL '1 millisecond'),
        "lastError" = ${message}
    WHERE "id" = ${event.id} AND "lockedBy" = ${workerId} AND "processedAt" IS NULL
    RETURNING "id"
  `;
  if (updated.length !== 1) {
    logger.warn(
      'Outbox retry was not scheduled because this worker no longer owns the event lease',
      {
        eventId: event.id,
        eventType: event.eventType,
        workerId,
        attempts: event.attempts,
      }
    );
    return;
  }
  logger.error('Outbox event processing failed; retry persisted', {
    eventId: event.id,
    eventType: event.eventType,
    attempts: event.attempts,
    delayMs,
    error,
  });
}

/**
 * Prune only successfully processed rows older than the retention window.
 * Idempotency keys live in a compact durable ledger so deleting payload rows
 * cannot make a replayed event key reusable. Each run is bounded and runs in
 * one transaction; pending, leased, and retryable rows are never candidates.
 */
async function pruneProcessedOutboxEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - OUTBOX_PROCESSED_RETENTION_MS);
  return prisma.$transaction(
    async tx => tx.$executeRaw`
    DELETE FROM "outbox_events" AS event
    WHERE event."id" IN (
      SELECT candidate."id"
      FROM "outbox_events" AS candidate
      WHERE candidate."processedAt" IS NOT NULL
        AND candidate."processedAt" < ${cutoff}
      ORDER BY candidate."processedAt" ASC
      LIMIT ${OUTBOX_RETENTION_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
  `
  );
}

/**
 * Prune completed push dispatches older than the retention window. Targets are
 * removed by ON DELETE CASCADE. Dead-lettered dispatches (processedAt IS NULL)
 * and anything pending/leased are never candidates, so operator recovery data
 * is preserved. Bounded per run and skip-locked like the outbox prune.
 */
async function pruneProcessedPushDispatches(): Promise<number> {
  const cutoff = new Date(Date.now() - PUSH_DISPATCH_RETENTION_MS);
  return prisma.$transaction(
    async tx => tx.$executeRaw`
    DELETE FROM "notification_push_dispatches" AS dispatch
    WHERE dispatch."id" IN (
      SELECT candidate."id"
      FROM "notification_push_dispatches" AS candidate
      WHERE candidate."processedAt" IS NOT NULL
        AND candidate."processedAt" < ${cutoff}
      ORDER BY candidate."processedAt" ASC
      LIMIT ${OUTBOX_RETENTION_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
  `
  );
}

/** Emit anomaly-focused queue health without logging every normal polling cycle. */
async function reportOutboxHealth(): Promise<void> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_EVENT_AGE_MS);
  const expiredLeaseBefore = new Date(now.getTime() - LEASE_SECONDS * 1_000);
  const recentFailureSince = new Date(now.getTime() - PUSH_FAILURE_HEALTH_WINDOW_MS);
  const [
    pending,
    staleReady,
    repeatedFailures,
    expiredLeases,
    deadLetterCount,
    pushDispatchPending,
    stalePushDispatches,
    deadLetterPushDispatches,
    permanentPushFailures,
    pendingPushTargets,
    pushTargetLeaseHealthRows,
    failedPushTargets,
  ] = await Promise.all([
    prisma.outboxEvent.aggregate({
      where: { processedAt: null, deadLetterAt: null },
      _count: { _all: true },
      _min: { createdAt: true },
      _max: { attempts: true },
    }),
    prisma.outboxEvent.count({
      where: {
        processedAt: null,
        deadLetterAt: null,
        createdAt: { lt: staleBefore },
        availableAt: { lte: now },
        OR: [{ lockedAt: null }, { lockedAt: { lt: expiredLeaseBefore } }],
      },
    }),
    prisma.outboxEvent.count({
      where: { processedAt: null, deadLetterAt: null, attempts: { gte: HIGH_ATTEMPT_THRESHOLD } },
    }),
    prisma.outboxEvent.count({
      where: {
        processedAt: null,
        deadLetterAt: null,
        lockedAt: { lt: expiredLeaseBefore },
        lockedBy: { not: null },
      },
    }),
    prisma.outboxEvent.count({ where: { processedAt: null, deadLetterAt: { not: null } } }),
    prisma.notificationPushDispatch.count({ where: { processedAt: null, deadLetterAt: null } }),
    prisma.notificationPushDispatch.count({
      where: {
        processedAt: null,
        deadLetterAt: null,
        createdAt: { lt: staleBefore },
        availableAt: { lte: now },
        OR: [{ lockedAt: null }, { lockedAt: { lt: expiredLeaseBefore } }],
      },
    }),
    prisma.notificationPushDispatch.count({
      where: { processedAt: null, deadLetterAt: { not: null } },
    }),
    prisma.notificationPushDispatch.count({
      where: { processedAt: { gte: recentFailureSince }, lastError: { not: null } },
    }),
    prisma.notificationPushDeliveryTarget.count({ where: { status: 'PENDING' } }),
    prisma.$queryRaw<Array<{ stalePushTargetLeases: number; exhaustedPendingPushTargets: number }>>`
      SELECT
        COUNT(*) FILTER (
          WHERE "lockedBy" IS NOT NULL
            AND "lockedAt" < NOW() - (${LEASE_SECONDS} * INTERVAL '1 second')
        )::int AS "stalePushTargetLeases",
        COUNT(*) FILTER (
          WHERE "attempts" >= ${PUSH_TARGET_MAX_ATTEMPTS}
            AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - (${LEASE_SECONDS} * INTERVAL '1 second'))
        )::int AS "exhaustedPendingPushTargets"
      FROM "notification_push_delivery_targets"
      WHERE "status" = 'PENDING'
    `,
    prisma.notificationPushDeliveryTarget.count({
      where: { status: 'FAILED', processedAt: { gte: recentFailureSince } },
    }),
  ]);
  const stalePushTargetLeases = pushTargetLeaseHealthRows[0]?.stalePushTargetLeases ?? 0;
  const exhaustedPendingPushTargets =
    pushTargetLeaseHealthRows[0]?.exhaustedPendingPushTargets ?? 0;

  if (
    staleReady === 0 &&
    repeatedFailures === 0 &&
    expiredLeases === 0 &&
    deadLetterCount === 0 &&
    stalePushDispatches === 0 &&
    deadLetterPushDispatches === 0 &&
    permanentPushFailures === 0 &&
    stalePushTargetLeases === 0 &&
    exhaustedPendingPushTargets === 0 &&
    failedPushTargets === 0
  )
    return;
  logger.warn('Outbox / notification push dispatch health anomaly detected', {
    pendingCount: pending._count._all,
    oldestPendingCreatedAt: pending._min.createdAt,
    maxPendingAttempts: pending._max.attempts,
    staleReadyCount: staleReady,
    repeatedFailureCount: repeatedFailures,
    expiredLeaseCount: expiredLeases,
    deadLetterCount,
    pushDispatchPendingCount: pushDispatchPending,
    stalePushDispatchCount: stalePushDispatches,
    deadLetterPushDispatchCount: deadLetterPushDispatches,
    completedPushDispatchesWithPermanentFailure: permanentPushFailures,
    pendingPushTargetCount: pendingPushTargets,
    stalePushTargetLeaseCount: stalePushTargetLeases,
    exhaustedPendingPushTargetCount: exhaustedPendingPushTargets,
    failedPushTargetCount: failedPushTargets,
    maxPushTargetAttempts: PUSH_TARGET_MAX_ATTEMPTS,
    maxProcessingAttempts: MAX_PROCESSING_ATTEMPTS,
    staleAgeMs: STALE_EVENT_AGE_MS,
    highAttemptThreshold: HIGH_ATTEMPT_THRESHOLD,
  });
}

async function processCacheGenerationBumpEvent(
  event: OutboxEvent,
  workerId: string
): Promise<void> {
  const goResult = await tryExecuteOutboxEventInGo(event, workerId);
  if (goResult) return;

  const payload = event.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Cache-generation outbox payload must be an object');
  }
  const eventPayload = payload as Record<string, unknown>;
  const genKey = eventPayload.genKey;
  if (typeof genKey !== 'string' || !genKey || genKey.length > 512) {
    throw new Error('Cache-generation outbox payload has an invalid genKey');
  }
  const requiredValue = eventPayload.retryRequiredGenKeys;
  const dependentValue = eventPayload.retryDependentGenKeys;
  const isGenerationKeyList = (value: unknown): value is string[] =>
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= 10 &&
      value.every(key => typeof key === 'string' && key.length > 0 && key.length <= 512));
  if (!isGenerationKeyList(requiredValue)) {
    throw new Error('Cache-generation outbox payload has invalid required generation keys');
  }
  if (!isGenerationKeyList(dependentValue)) {
    throw new Error('Cache-generation outbox payload has invalid dependent generation keys');
  }
  // The durable event owns the full dependency chain: invalidate its source,
  // then all required sibling sources, and only then dependent caches. This is
  // important when a single mutation hides multiple namespaces: no event may
  // invalidate the homepage while a sibling namespace can still be stale.
  await prisma.$transaction(async tx => {
    if (!(await tryAcquireOutboxExecutionLock(tx, event.id))) return;
    // The transaction lock is shared with Go. It is held while cache keys are
    // invalidated and the durable event is acknowledged, so an ambiguous HTTP
    // timeout cannot cause the two implementations to run this event together.
    const succeeded = await bumpGeneration(genKey, { persistRetry: false });
    if (!succeeded) throw new Error(`Redis generation bump failed for ${genKey}`);
    for (const requiredGenKey of (requiredValue as string[] | undefined) ?? []) {
      const requiredSucceeded = await bumpGeneration(requiredGenKey, { persistRetry: false });
      if (!requiredSucceeded)
        throw new Error(`Redis required generation bump failed for ${requiredGenKey}`);
    }
    for (const dependentGenKey of (dependentValue as string[] | undefined) ?? []) {
      const dependentSucceeded = await bumpGeneration(dependentGenKey, { persistRetry: false });
      if (!dependentSucceeded)
        throw new Error(`Redis dependent generation bump failed for ${dependentGenKey}`);
    }
    const acknowledged = await tx.outboxEvent.updateMany({
      where: { id: event.id, lockedBy: workerId, processedAt: null },
      data: { processedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null },
    });
    if (acknowledged.count !== 1)
      throw new Error('Outbox lease lost before cache-generation acknowledgement');
  });
}

export async function processOutboxBatch(
  workerId = `outbox-${process.pid}-${randomUUID()}`
): Promise<number> {
  const events = await claimBatch(workerId);
  for (const event of events) {
    try {
      await withLeaseHeartbeat(event, workerId, async () => {
        if (event.eventType === 'USER_ACTIVITY_RECORD') await processActivityEvent(event, workerId);
        else if (event.eventType === 'FOLLOWED_ACTIVITY_NOTIFICATION')
          await processFollowedActivityEvent(event, workerId);
        else if (event.eventType === 'SAVED_SEARCH_MATCH_NOTIFICATION')
          await processSavedSearchMatchEvent(event, workerId);
        else if (event.eventType === 'CACHE_GENERATION_BUMP')
          await processCacheGenerationBumpEvent(event, workerId);
        else throw new Error(`Unsupported outbox event type: ${event.eventType}`);
      });
    } catch (error) {
      try {
        await markRetry(event, workerId, error);
      } catch (retryPersistenceError) {
        // The event remains unacknowledged. Once its lease expires another worker
        // can reclaim it; do not mislabel this as a successfully scheduled retry.
        logger.error('Outbox retry persistence failed; event remains eligible for lease recovery', {
          eventId: event.id,
          eventType: event.eventType,
          workerId,
          error: retryPersistenceError,
        });
      }
    }
  }
  return events.length;
}

export async function runOutboxWorker(shouldStop: () => boolean = () => false): Promise<void> {
  logger.info('Transactional outbox worker started');
  let lastHealthReportAt = 0;
  let lastRetentionRunAt = 0;
  let idleStreak = 0;
  while (!shouldStop()) {
    const count = await processOutboxBatch().catch(error => {
      logger.error('Outbox batch claim failed', { error });
      return 0;
    });
    const pushDispatchCount = await processPushDispatchBatch().catch(error => {
      logger.error('Notification push dispatch batch failed', { error });
      return 0;
    });
    const now = Date.now();
    if (now - lastHealthReportAt >= HEALTH_REPORT_INTERVAL_MS) {
      lastHealthReportAt = now;
      await reportOutboxHealth().catch(error => {
        logger.error('Outbox queue health report failed', { error });
      });
    }
    if (now - lastRetentionRunAt >= OUTBOX_RETENTION_INTERVAL_MS) {
      lastRetentionRunAt = now;
      await pruneProcessedOutboxEvents()
        .then(deletedCount => {
          if (deletedCount > 0) {
            logger.info('Pruned processed outbox event rows while preserving idempotency keys', {
              deletedCount,
              retentionDays: OUTBOX_PROCESSED_RETENTION_MS / (24 * 60 * 60 * 1_000),
              batchLimit: OUTBOX_RETENTION_BATCH_SIZE,
            });
          }
        })
        .catch(error => {
          logger.error(
            'Processed outbox retention cleanup failed; events were not acknowledged or discarded',
            { error }
          );
        });
      await pruneProcessedPushDispatches()
        .then(deletedCount => {
          if (deletedCount > 0) {
            logger.info('Pruned completed push dispatches', {
              deletedCount,
              retentionDays: PUSH_DISPATCH_RETENTION_MS / (24 * 60 * 60 * 1_000),
              batchLimit: OUTBOX_RETENTION_BATCH_SIZE,
            });
          }
        })
        .catch(error => {
          logger.error('Completed push dispatch retention cleanup failed', { error });
        });
    }
    if (count === 0 && pushDispatchCount === 0) {
      // Idle: back off 1s → 2s → 5s → 10s (max).
      idleStreak += 1;
      const delay = IDLE_BACKOFF_MS[Math.min(idleStreak - 1, IDLE_BACKOFF_MS.length - 1)];
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      // A job appeared: reset to 1s immediately on the next poll.
      idleStreak = 0;
    }
  }
}
