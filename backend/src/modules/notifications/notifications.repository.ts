import { prisma } from '../../config/prisma';
import { Prisma, Notification, NotificationType, PushSubscription } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { unreadNotificationsCache } from '../../shared/utils/unreadNotificationsCache';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

// FIX PWA-PUSH-01: the { endpoint, keys: { p256dh, auth } } shape is
// exactly what PushSubscription.toJSON() produces in the browser (see
// frontend/lib/pwa.ts's subscribeToPush) — kept as a nested `keys`
// object here rather than flattened, so the controller can pass the
// request body through with minimal reshaping and this type stays
// recognizable against the W3C Push API spec it mirrors.
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const notificationsRepository = {
  create: async (input: CreateNotificationInput): Promise<Notification> => {
    const notification = await prisma.notification.create({ data: input });
    // AUDIT-FIX 1.10/1.12: this is the only creation path with a single
    // known recipient — invalidate immediately rather than waiting out
    // the cache's TTL, so a freshly created notification's unread count
    // is correct on the very next read (e.g. the badge right after a
    // push arrives), not just eventually-correct.
    await unreadNotificationsCache.invalidate(input.userId);
    return notification;
  },

  /** Fan-out create for a broadcast (admin promotion) or a price-change
   * alert reaching every favoriter of one ad — createMany is a single
   * round trip instead of N sequential creates. Prisma's createMany
   * doesn't return the created rows (fine here: nothing reads them back
   * immediately after a broadcast). */
  createMany: async (inputs: CreateNotificationInput[]): Promise<Prisma.BatchPayload> => {
    const result = await prisma.notification.createMany({ data: inputs });
    // AUDIT-FIX 1.10/1.12: invalidate every distinct recipient's cached
    // count, not just re-fetch — Set de-dupes since a broadcast/fan-out
    // list is not guaranteed unique-per-user (see onSavedSearchMatched's
    // own comment: one user can appear twice for two different matches).
    // Best-effort in parallel; unreadNotificationsCache itself swallows
    // individual Redis failures, so one failed invalidation can't block
    // or fail the others.
    const recipientIds = Array.from(new Set(inputs.map(i => i.userId)));
    await Promise.all(recipientIds.map(userId => unreadNotificationsCache.invalidate(userId)));
    return result;
  },

  findManyForUser: async (
    userId: string,
    query: { page?: number; limit?: number; unreadOnly?: boolean }
  ): Promise<{ notifications: Notification[]; total: number }> => {
    const { page = 1, limit = 20, unreadOnly = false } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.notification.count({ where }),
    ]);
    return { notifications, total };
  },

  countUnreadForUser: async (userId: string): Promise<number> => {
    const cached = await unreadNotificationsCache.get(userId);
    if (cached !== null) return cached;

    const count = await prisma.notification.count({ where: { userId, readAt: null } });
    await unreadNotificationsCache.set(userId, count);
    return count;
  },

  /** Marks one notification read — scoped to userId so a caller can
   * never mark someone else's notification as read by guessing an id
   * (same ownership-in-the-WHERE-clause shape as
   * messagesRepository.markReadForRecipient). Returns the row count
   * actually updated: 0 means either the id doesn't exist or it isn't
   * the caller's — the service layer treats both as NotFound. */
  markRead: async (id: string, userId: string): Promise<Prisma.BatchPayload> => {
    const result = await prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    // AUDIT-FIX 1.10/1.12: invalidate even when count is 0 (id didn't
    // match/wasn't unread) — an unconditional invalidate is cheap and
    // never wrong, whereas skipping it on the 0-count path risks a rare
    // but real race (count read stale-cached as unread between this
    // notification actually being read by another concurrent request
    // and this one landing) leaving a stale badge count uncorrected.
    await unreadNotificationsCache.invalidate(userId);
    return result;
  },

  markAllRead: async (userId: string): Promise<Prisma.BatchPayload> => {
    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    await unreadNotificationsCache.invalidate(userId);
    return result;
  },

  // FIX PWA-PUSH-01: upsert on `endpoint` (globally unique — see the
  // PushSubscription model's own doc comment) so re-subscribing the
  // same browser after clearing/re-granting permission updates the
  // existing row's keys instead of erroring on the unique constraint
  // or silently creating a duplicate that would double-send later.
  // `create` sets userId; `update` deliberately does NOT touch userId
  // — an endpoint belonging to one user's browser can't be silently
  // reassigned to whichever user happens to re-subscribe it (this
  // would only occur if the same physical browser subscription was
  // replayed while logged in as a different account, which the update
  // branch intentionally leaves alone rather than resolving implicitly).
  upsertPushSubscription: (
    userId: string,
    input: PushSubscriptionInput
  ): Promise<PushSubscription> =>
    prisma.pushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: {
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      },
      update: {
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      },
    }),

  // Scoped to userId so a caller can never delete someone else's
  // subscription by guessing/replaying an endpoint — same
  // ownership-in-the-WHERE-clause shape as markRead above. Returns the
  // row count; the service layer doesn't treat 0 as an error here
  // (unlike markRead) since unsubscribeFromPush's caller in lib/pwa.ts
  // already unsubscribed locally regardless of whether the server-side
  // row existed, and calls this best-effort (see its own .catch()).
  deletePushSubscription: (userId: string, endpoint: string): Promise<Prisma.BatchPayload> =>
    prisma.pushSubscription.deleteMany({ where: { userId, endpoint } }),
};
