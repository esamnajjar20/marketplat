import { prisma } from '../../config/prisma';
import { Prisma, Notification, NotificationType, PushSubscription, FcmDeviceToken } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { unreadNotificationsCache } from '../../shared/utils/unreadNotificationsCache';
import { publishNotificationEvent, publishNotificationEventToMany } from '../../shared/utils/notificationStream';
import { pushSubscriptionsRepository } from '../../shared/utils/pushSubscriptionsRepository';
// NEW — native (Capacitor/FCM) counterpart to pushSubscriptionsRepository above.
import { fcmDeviceTokensRepository } from '../../shared/utils/fcmDeviceTokensRepository';
import { maybeScheduleEmailFallback } from '../../shared/utils/emailFallbackScheduler';

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
function asLiveData(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export const notificationsRepository = {
  create: async (input: CreateNotificationInput): Promise<Notification> => {
    const notification = await prisma.notification.create({ data: input });
    await unreadNotificationsCache.invalidate(input.userId);
    maybeScheduleEmailFallback(input.userId, notification.type);
    void publishNotificationEvent(input.userId, {
      type: 'notification',
      action: 'created',
      notificationId: notification.id,
      notificationType: notification.type,
      title: notification.title,
      body: notification.body,
      data: asLiveData(notification.data),
    });
    return notification;
  },

  /** Fan-out create for a broadcast (admin promotion) or a price-change
   * alert reaching every favoriter of one ad — createMany is a single
   * round trip instead of N sequential creates. Prisma's createMany
   * doesn't return the created rows (fine here: nothing reads them back
   * immediately after a broadcast). */
  createMany: async (inputs: CreateNotificationInput[]): Promise<Prisma.BatchPayload> => {
    const result = await prisma.notification.createMany({ data: inputs });
    // invalidate every distinct recipient's cached
    // count, not just re-fetch — Set de-dupes since a broadcast/fan-out
    // list is not guaranteed unique-per-user (see onSavedSearchMatched's
    // own comment: one user can appear twice for two different matches).
    // Best-effort in parallel; unreadNotificationsCache itself swallows
    // individual Redis failures, so one failed invalidation can't block
    // or fail the others.
    const recipientIds = Array.from(new Set(inputs.map(i => i.userId)));

    // bound concurrent
    // invalidation. Each invalidate is now a Redis DEL + PUBLISH (see
    // the unreadNotificationsCache Pub/Sub fix), so an unbounded
    // Promise.all over recipientIds meant an admin broadcast to 100K
    // users issued 200K Redis commands in a single tick — saturating
    // the Valkey connection, stalling the Node event loop, and
    // pressuring the plan's command quota. 50 concurrent invalidations
    // per batch keeps the pipeline warm without flooding. Remaining
    // entries drain in subsequent batches before createMany returns,
    // so no cache entry is left stale by the time the response goes out.
    const INVALIDATE_CONCURRENCY = 50;
    for (let i = 0; i < recipientIds.length; i += INVALIDATE_CONCURRENCY) {
      await Promise.all(
        recipientIds
          .slice(i, i + INVALIDATE_CONCURRENCY)
          .map(userId => unreadNotificationsCache.invalidate(userId)),
      );
    }

    // fan-out over SSE must
    // respect per-recipient content. The previous implementation
    // always published inputs[0]'s { type, title, body } to every
    // recipient — correct today, because every existing call site
    // (admin broadcast, favorite-price-change alert) sends identical
    // content to all recipients. But the moment any future caller
    // sends *different* content per user through createMany (e.g. "X
    // favorited YOUR ad"), every recipient after the first would see
    // the wrong title/body in their live toast until a manual refresh
    // pulled the correct row from the DB.
    //
    // Detect the two cases explicitly so the common (uniform) case
    // stays a single publish call, and the mixed case degrades to
    // per-user publishes with each user's real content. Comparison is
    // on the three fields the SSE payload actually carries — if any
    // future field is added to the payload, update the comparison too
    // (`data` was added for toast deep links).
    const allSameContent =
      inputs.length > 0 &&
      inputs.every(
        (i) =>
          i.type === inputs[0].type &&
          i.title === inputs[0].title &&
          i.body === inputs[0].body &&
          JSON.stringify(i.data ?? null) === JSON.stringify(inputs[0].data ?? null),
      );

    if (allSameContent) {
      void publishNotificationEventToMany(recipientIds, {
        type: 'notification',
        action: 'created',
        notificationType: inputs[0].type,
        title: inputs[0].title,
        body: inputs[0].body,
        data: asLiveData(inputs[0].data),
      });
    } else {
      // Mixed content: one publish per recipient with their own data.
      // Kept synchronous-looking (void + Promise.all) so createMany
      // keeps its "fire-and-forget fan-out" contract.
      void Promise.all(
        inputs.map((input) =>
          publishNotificationEvent(input.userId, {
            type: 'notification',
            action: 'created',
            notificationType: input.type,
            title: input.title,
            body: input.body,
            data: asLiveData(input.data),
          }),
        ),
      );
    }

    return result;
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
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.notification.count({ where }),
    ]);
    return { notifications, total };
  },

  // mirror userCache's inflightMap
  // pattern (see shared/utils/userCache.ts) to collapse concurrent
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
    await unreadNotificationsCache.invalidate(userId);
    return result;
  },

  /** NOTIF-UX-01: إعادة الإشعار لغير مقروء — مفيد بعد فتح بالخطأ. */
  markUnread: async (id: string, userId: string): Promise<Prisma.BatchPayload> => {
    const result = await prisma.notification.updateMany({
      where: { id, userId, readAt: { not: null } },
      data: { readAt: null },
    });
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

  deleteForUser: async (id: string, userId: string): Promise<Prisma.BatchPayload> => {
    const result = await prisma.notification.deleteMany({ where: { id, userId } });
    if (result.count > 0) await unreadNotificationsCache.invalidate(userId);
    return result;
  },

  deleteAllReadForUser: async (userId: string): Promise<Prisma.BatchPayload> => {
    const result = await prisma.notification.deleteMany({
      where: { userId, readAt: { not: null } },
    });
    await unreadNotificationsCache.invalidate(userId);
    return result;
  },

  deleteReadOlderThan: async (olderThan: Date): Promise<number> => {
    const result = await prisma.notification.deleteMany({
      where: { readAt: { not: null }, createdAt: { lt: olderThan } },
    });
    return result.count;
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
      await unreadNotificationsCache.invalidate(input.userId);
      // The earlier check may already have run (and found the user online or
      // opted out); an idempotent re-schedule opens a fresh window.
      maybeScheduleEmailFallback(input.userId, updated.type);
      void publishNotificationEvent(input.userId, {
        type: 'notification',
        action: 'updated',
        notificationId: updated.id,
        notificationType: updated.type,
        title: updated.title,
        body: updated.body,
        data: asLiveData(updated.data),
      });
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
      await unreadNotificationsCache.invalidate(userId);
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
  // truth. Now both go through shared/utils/pushSubscriptionsRepository.ts;
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
