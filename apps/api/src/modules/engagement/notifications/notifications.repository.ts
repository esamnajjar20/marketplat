import { prisma } from '../../../config/prisma';
import {
  Prisma,
  Notification,
  NotificationType,
  PushSubscription,
  FcmDeviceToken,
} from '@prisma/client';
import { getPaginationParams } from '../../../shared/http/pagination';
import { unreadNotificationsCache } from '../../../shared/cache/unreadNotificationsCache';
import { notificationDispatcher } from '../../../shared/notifications/notificationDispatcher';
import { pushSubscriptionsRepository } from '../../../shared/notifications/pushSubscriptionsRepository';
// NEW — native (Capacitor/FCM) counterpart to pushSubscriptionsRepository above.
import { fcmDeviceTokensRepository } from '../../../shared/notifications/fcmDeviceTokensRepository';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

// the { endpoint, keys: { p256dh, auth } } shape is
// exactly what PushSubscription.toJSON() produces in the browser (see
// frontend/lib/pwa.ts's subscribeToPush) — kept as a nested `keys`
// object here rather than flattened, so the controller can pass the
// request body through with minimal reshaping and this type stays
// recognizable against the W3C Push API spec it mirrors.
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// NEW — native-app counterpart to PushSubscriptionInput above.
export interface RegisterFcmTokenInput {
  token: string;
  platform: string;
}

// per-user in-flight map for the
// countUnreadForUser single-flight above. Kept as a module-level Map
// rather than a WeakMap keyed on userId because userIds are strings,
// not objects. Bounded implicitly by concurrent requests (a user can
// only have as many in-flight calls as they issue in parallel).
const countInflight = new Map<string, Promise<number>>();

/** Notification.data is Json? — only plain objects are deep-linkable. */
export const notificationsRepository = {
  create: async (input: CreateNotificationInput): Promise<Notification> => {
    const notification = await prisma.notification.create({ data: input });
    await notificationDispatcher.publishCreated([notification], 'notifications.repository.create');
    return notification;
  },

  /** Fan-out create for a broadcast (admin promotion) or a price-change
   * alert reaching every favoriter of one ad. createManyAndReturn provides
   * the persisted rows required by the shared post-commit lifecycle, while
   * bounded chunks keep INSERT RETURNING and live-event fan-out predictable. */
  createMany: async (inputs: CreateNotificationInput[]): Promise<Prisma.BatchPayload> => {
    // Keep INSERT RETURNING, cache invalidation, and SSE publication bounded.
    // The service fan-out path already streams 500 recipients at a time; this
    // repository guard also protects admin/internal callers that pass a large
    // array directly.
    const BATCH_SIZE = 500;
    let totalCreated = 0;

    for (let offset = 0; offset < inputs.length; offset += BATCH_SIZE) {
      const batch = inputs.slice(offset, offset + BATCH_SIZE);
      if (batch.length === 0) continue;

      const created = await prisma.notification.createManyAndReturn({
        data: batch,
        select: {
          id: true,
          userId: true,
          type: true,
          title: true,
          body: true,
          data: true,
        },
      });
      totalCreated += created.length;

      // All post-commit effects (unread cache, SSE and email fallback) share
      // the same lifecycle dispatcher used by Outbox and Go-created rows.
      await notificationDispatcher.publishCreated(created, 'notifications.repository.createMany');
    }

    return { count: totalCreated };
  },

  findManyForUser: async (
    userId: string,
    query: {
      page?: number;
      limit?: number;
      unreadOnly?: boolean;
      types?: NotificationType[];
    }
  ): Promise<{ notifications: Notification[]; total: number }> => {
    const { page = 1, limit = 20, unreadOnly = false, types } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
      ...(types && types.length > 0 ? { type: { in: types } } : {}),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      prisma.notification.count({ where }),
    ]);
    return { notifications, total };
  },

  // mirror userCache's inflightMap
  // pattern (see shared/cache/userCache.ts) to collapse concurrent
  // misses on the same user into one count() query. Without this, a
  // page with multiple useUnreadCount() consumers mounting at the
  // same tick (bell in header, dashboard, notification toast,
  // Service Worker's periodic check) fired N identical count queries
  // whenever the cache was cold or just invalidated — e.g. right
  // after every mark-read, exactly when traffic is already spiking.
  // The result is per-user only; different users never share an entry.
  countUnreadForUser: async (userId: string): Promise<number> => {
    const cached = await unreadNotificationsCache.get(userId);
    if (cached !== null) return cached;

    const existing = countInflight.get(userId);
    if (existing) return existing;

    const promise = (async (): Promise<number> => {
      try {
        const count = await prisma.notification.count({ where: { userId, readAt: null } });
        await unreadNotificationsCache.set(userId, count);
        return count;
      } finally {
        countInflight.delete(userId);
      }
    })();

    countInflight.set(userId, promise);
    return promise;
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
    // invalidate even when count is 0 (id didn't
    // match/wasn't unread) — an unconditional invalidate is cheap and
    // never wrong, whereas skipping it on the 0-count path risks a rare
    // but real race (count read stale-cached as unread between this
    // notification actually being read by another concurrent request
    // and this one landing) leaving a stale badge count uncorrected.
    await notificationDispatcher.publishStateChange({ userId, action: 'read', notificationId: id, changed: result.count > 0, label: 'notifications.repository.markRead' });
    return result;
  },

  /** NOTIF-UX-01: إعادة الإشعار لغير مقروء — مفيد بعد فتح بالخطأ. */
  markUnread: async (id: string, userId: string): Promise<Prisma.BatchPayload> => {
    const result = await prisma.notification.updateMany({
      where: { id, userId, readAt: { not: null } },
      data: { readAt: null },
    });
    await notificationDispatcher.publishStateChange({ userId, action: 'updated', notificationId: id, changed: result.count > 0, label: 'notifications.repository.markUnread' });
    return result;
  },

  markAllRead: async (userId: string): Promise<Prisma.BatchPayload> => {
    const result = await prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    await notificationDispatcher.publishStateChange({ userId, action: 'read', changed: result.count > 0, label: 'notifications.repository.markAllRead' });
    return result;
  },

  deleteForUser: async (id: string, userId: string): Promise<Prisma.BatchPayload> => {
    const result = await prisma.notification.deleteMany({ where: { id, userId } });
    if (result.count > 0) await notificationDispatcher.publishStateChange({ userId, action: 'deleted', notificationId: id, label: 'notifications.repository.deleteForUser' });
    return result;
  },

  deleteAllReadForUser: async (userId: string): Promise<Prisma.BatchPayload> => {
    const result = await prisma.notification.deleteMany({
      where: { userId, readAt: { not: null } },
    });
    await notificationDispatcher.publishStateChange({ userId, action: 'deleted', changed: result.count > 0, label: 'notifications.repository.deleteAllReadForUser' });
    return result;
  },

  deleteReadOlderThan: async (olderThan: Date): Promise<number> => {
    const BATCH_SIZE = 500;
    let totalDeleted = 0;

    for (;;) {
      const candidates = await prisma.notification.findMany({
        where: { readAt: { not: null }, createdAt: { lt: olderThan } },
        select: { id: true, userId: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: BATCH_SIZE,
      });
      if (candidates.length === 0) break;

      const result = await prisma.notification.deleteMany({
        where: {
          id: { in: candidates.map(notification => notification.id) },
          readAt: { not: null },
          createdAt: { lt: olderThan },
        },
      });
      totalDeleted += result.count;

      // Retention is a bulk delete, so publish one refetch signal per affected
      // user rather than broadcasting every expired row to every device.
      if (result.count > 0) {
        const affectedUsers = Array.from(new Set(candidates.map(notification => notification.userId)));
        await Promise.all(affectedUsers.map(userId =>
          notificationDispatcher.publishStateChange({
            userId,
            action: 'deleted',
            changed: true,
            label: 'notifications.repository.deleteReadOlderThan',
          })
        ));
      }

      // A concurrent update can make some candidates no longer eligible.
      // Stop on a no-op batch instead of re-reading the same rows forever.
      if (result.count === 0) break;
    }

    return totalDeleted;
  },

  /**
   * Marks every unread NEW_MESSAGE notification for this conversation as
   * read — called when the user opens/polls the thread (getMessages), so
   * the bell stays in sync with chat read state without requiring a
   * separate click on each notification row.
   */

  /**
   * NEW_MESSAGE coalesce: if an unread NEW_MESSAGE already exists for this
   * conversation, refresh its body/title and bump createdAt so it stays a
   * single badge item instead of one row per message in a burst.
   */
  createOrRefreshNewMessage: async (input: {
    userId: string;
    conversationId: string;
    title: string;
    body: string;
  }): Promise<Notification> => {
    const existing = await prisma.notification.findFirst({
      where: {
        userId: input.userId,
        type: 'NEW_MESSAGE',
        readAt: null,
        data: { path: ['conversationId'], equals: input.conversationId },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      // data.count = unread messages folded into this row. Rows written
      // before this field existed count as 1, so the first refresh yields 2.
      const prev =
        existing.data && typeof existing.data === 'object' && !Array.isArray(existing.data)
          ? (existing.data as Record<string, unknown>)
          : {};
      const prevCount =
        typeof prev.count === 'number' && Number.isFinite(prev.count) && prev.count >= 1
          ? Math.floor(prev.count)
          : 1;
      const updated = await prisma.notification.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          body: input.body,
          createdAt: new Date(),
          data: { ...prev, conversationId: input.conversationId, count: prevCount + 1 },
        },
      });
      await notificationDispatcher.publishStateChange({ userId: input.userId, action: 'updated', notificationId: updated.id, label: 'notifications.repository.refreshNewMessage' });
      return updated;
    }
    return notificationsRepository.create({
      userId: input.userId,
      type: 'NEW_MESSAGE',
      title: input.title,
      body: input.body,
      data: { conversationId: input.conversationId, count: 1 },
    });
  },

  markUnreadNewMessagesForConversation: async (
    userId: string,
    conversationId: string
  ): Promise<Prisma.BatchPayload> => {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        type: 'NEW_MESSAGE',
        readAt: null,
        data: { path: ['conversationId'], equals: conversationId },
      },
      data: { readAt: new Date() },
    });
    if (result.count > 0) {
      await notificationDispatcher.publishStateChange({ userId, action: 'read', changed: true, label: 'notifications.repository.markConversationMessagesRead' });
    }
    return result;
  },

  // upsert on `endpoint` (globally unique — see the
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
  // previously called prisma.pushSubscription.upsert
  // directly, duplicating the exact same upsert logic pushService.ts
  // (shared/utils) also needed and had independently implemented —
  // two call sites writing the same table with no shared source of
  // truth. Now both go through shared/notifications/pushSubscriptionsRepository.ts;
  // this method stays as the module-facing entry point (keeping the
  // PushSubscriptionInput `{ endpoint, keys: { p256dh, auth } }` shape
  // controllers/services in this module already use) and just adapts
  // it to that repository's flatter input shape.
  upsertPushSubscription: (
    userId: string,
    input: PushSubscriptionInput,
    defaultLabel?: string | null
  ): Promise<PushSubscription> =>
    pushSubscriptionsRepository.upsert({
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      defaultLabel,
    }),

  // Scoped to userId so a caller can never delete someone else's
  // subscription by guessing/replaying an endpoint — same
  // ownership-in-the-WHERE-clause shape as markRead above. Returns the
  // row count; the service layer doesn't treat 0 as an error here
  // (unlike markRead) since unsubscribeFromPush's caller in lib/pwa.ts
  // already unsubscribed locally regardless of whether the server-side
  // row existed, and calls this best-effort (see its own .catch()).
  //
  // delegates to the same shared repository as
  // upsertPushSubscription above, for the same one-source-of-truth reason.
  deletePushSubscription: (userId: string, endpoint: string): Promise<Prisma.BatchPayload> =>
    pushSubscriptionsRepository.deleteForUser(userId, endpoint),

  // NEW — same module-facing-wrapper-around-the-shared-repository shape
  // as upsertPushSubscription/deletePushSubscription above, for
  // FcmDeviceToken (native app push) instead of PushSubscription (web
  // push). See fcmDeviceTokensRepository.ts's own header.
  upsertFcmDeviceToken: (
    userId: string,
    input: RegisterFcmTokenInput,
    defaultLabel?: string | null
  ): Promise<FcmDeviceToken> =>
    fcmDeviceTokensRepository.upsert({
      userId,
      token: input.token,
      platform: input.platform,
      defaultLabel,
    }),

  deleteFcmDeviceToken: (userId: string, token: string): Promise<Prisma.BatchPayload> =>
    fcmDeviceTokensRepository.deleteForUser(userId, token),
};
