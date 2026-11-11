import { getProductionScheduledJobScript } from '../../scripts/childJobRunner';

/**
 * Strict, allow-list request validation for the Go worker callbacks.
 * These are hand-written (not zod) on purpose: they reject unknown keys and
 * return the exact historic 400 messages the Go client already depends on.
 */
export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every(key => allowed.includes(key));

const isBoundedString = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

// ── run-scheduled-job ────────────────────────────────────────────────

export interface ScheduledJobRequest {
  jobName: string;
  scheduledFor: string;
}

export function parseScheduledJobRequest(body: unknown): Validated<ScheduledJobRequest> {
  const invalid = fail('invalid scheduled job request');
  if (!isRecord(body) || !hasOnlyKeys(body, ['jobName', 'scheduledFor'])) return invalid;

  const { jobName, scheduledFor } = body;
  if (typeof jobName !== 'string' || !getProductionScheduledJobScript(jobName)) return invalid;
  if (typeof scheduledFor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) return invalid;

  const parsed = new Date(`${scheduledFor}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== scheduledFor) {
    return invalid;
  }
  return { ok: true, value: { jobName, scheduledFor } };
}

// ── publish-outbox-notifications ─────────────────────────────────────

export interface OutboxNotificationItem {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
}

export interface OutboxNotificationsRequest {
  eventId: string;
  notifications: OutboxNotificationItem[];
}

const OUTBOX_ITEM_KEYS = ['id', 'userId', 'type', 'title', 'body', 'data'] as const;

export function parseOutboxNotificationsRequest(
  body: unknown
): Validated<OutboxNotificationsRequest> {
  if (
    !isRecord(body) ||
    !hasOnlyKeys(body, ['eventId', 'notifications']) ||
    !isBoundedString(body.eventId, 1, 128) ||
    !Array.isArray(body.notifications) ||
    body.notifications.length < 1 ||
    body.notifications.length > 50
  ) {
    return fail('invalid outbox notification callback');
  }

  const notifications: OutboxNotificationItem[] = [];
  const seenIds = new Set<string>();
  for (const value of body.notifications) {
    if (
      !isRecord(value) ||
      !hasOnlyKeys(value, OUTBOX_ITEM_KEYS) ||
      !isBoundedString(value.id, 1, 128) ||
      !isBoundedString(value.userId, 1, 128) ||
      !isBoundedString(value.type, 1, 80) ||
      typeof value.title !== 'string' ||
      value.title.length > 500 ||
      typeof value.body !== 'string' ||
      value.body.length > 2_000 ||
      !(value.data === null || value.data === undefined || isRecord(value.data)) ||
      seenIds.has(value.id)
    ) {
      return fail('invalid outbox notification item');
    }
    seenIds.add(value.id);
    notifications.push({
      id: value.id,
      userId: value.userId,
      type: value.type,
      title: value.title,
      body: value.body,
      data: value.data === null || value.data === undefined ? null : (value.data as Record<string, unknown>),
    });
  }

  return { ok: true, value: { eventId: body.eventId, notifications } };
}

// ── publish-durable-notifications ────────────────────────────────────

export function parseDurableNotificationsRequest(body: unknown): Validated<{ notificationIds: string[] }> {
  if (
    !isRecord(body) ||
    !hasOnlyKeys(body, ['notificationIds']) ||
    !Array.isArray(body.notificationIds) ||
    body.notificationIds.length > 500
  ) {
    return fail('invalid durable notification callback');
  }

  const notificationIds: string[] = [];
  const seen = new Set<string>();
  for (const id of body.notificationIds) {
    if (!isBoundedString(id, 1, 128) || seen.has(id)) {
      return fail('invalid durable notification ID');
    }
    seen.add(id);
    notificationIds.push(id);
  }
  return { ok: true, value: { notificationIds } };
}

// ── send-push-target ─────────────────────────────────────────────────

export type PushChannel = 'WEB_PUSH' | 'FCM';

export interface InternalPushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  image?: string;
  type?: string;
  urgent?: boolean;
  bypassQuietHours?: boolean;
}

export interface PushTargetRequest {
  channel: PushChannel;
  userId: string;
  targetId: string;
  payload: InternalPushPayload;
}

const PUSH_TOP_LEVEL_KEYS = ['channel', 'userId', 'targetId', 'payload'] as const;
const PUSH_PAYLOAD_KEYS = [
  'title', 'body', 'url', 'tag', 'image', 'type', 'urgent', 'bypassQuietHours',
] as const;

export function parsePushTargetRequest(body: unknown): Validated<PushTargetRequest> {
  const invalid = fail('invalid push target request');
  if (!isRecord(body) || !hasOnlyKeys(body, PUSH_TOP_LEVEL_KEYS)) return invalid;

  const payload = isRecord(body.payload) ? body.payload : null;
  if (!payload || !hasOnlyKeys(payload, PUSH_PAYLOAD_KEYS)) return invalid;

  const optionalString = (key: string, max: number): boolean => {
    const value = payload[key];
    return value === undefined || value === null || (typeof value === 'string' && value.length <= max);
  };
  const requiredString = (key: string, max: number): boolean => {
    const value = payload[key];
    return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  };

  if (
    (body.channel !== 'WEB_PUSH' && body.channel !== 'FCM') ||
    !isBoundedString(body.userId, 1, 128) ||
    !isBoundedString(body.targetId, 1, 128) ||
    !requiredString('title', 256) ||
    !optionalString('body', 4096) ||
    !optionalString('url', 2048) ||
    !optionalString('tag', 256) ||
    !optionalString('image', 2048) ||
    !optionalString('type', 80) ||
    (payload.urgent !== undefined && typeof payload.urgent !== 'boolean') ||
    (payload.bypassQuietHours !== undefined && typeof payload.bypassQuietHours !== 'boolean')
  ) {
    return invalid;
  }

  const normalized: InternalPushPayload = {
    title: payload.title as string,
    body: (payload.body as string | undefined) ?? '',
    ...(typeof payload.url === 'string' ? { url: payload.url } : {}),
    ...(typeof payload.tag === 'string' ? { tag: payload.tag } : {}),
    ...(typeof payload.image === 'string' ? { image: payload.image } : {}),
    ...(typeof payload.type === 'string' ? { type: payload.type } : {}),
    ...(typeof payload.urgent === 'boolean' ? { urgent: payload.urgent } : {}),
    ...(typeof payload.bypassQuietHours === 'boolean'
      ? { bypassQuietHours: payload.bypassQuietHours }
      : {}),
  };

  return {
    ok: true,
    value: {
      channel: body.channel,
      userId: body.userId as string,
      targetId: body.targetId as string,
      payload: normalized,
    },
  };
}
