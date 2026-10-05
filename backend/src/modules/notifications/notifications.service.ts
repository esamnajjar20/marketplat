import { Notification, NotificationType, Prisma } from '@prisma/client';
import { notificationsRepository, PushSubscriptionInput, RegisterFcmTokenInput } from './notifications.repository';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { pushService } from '../../shared/utils/pushService';
import { prisma } from '../../config/prisma';
import { TooManyRequestsError } from '../../shared/errors/TooManyRequestsError';
import { pushSubscriptionsRepository } from '../../shared/utils/pushSubscriptionsRepository';
import { fcmDeviceTokensRepository } from '../../shared/utils/fcmDeviceTokensRepository';
import {
  deviceFingerprint,
  labelForNativePlatform,
  labelFromUserAgent,
} from '../../shared/utils/deviceLabel';

export type DeviceKind = 'web' | 'native';

export interface NotificationDevice {
  id: string;
  kind: DeviceKind;
  /** User-visible name; null on rows registered before labels existed. */
  label: string | null;
  /** 'android' | 'ios' for native rows, null for browsers. */
  platform: string | null;
  /** sha256(endpoint|token) prefix — lets a client recognise its own row without the credential. */
  fingerprint: string;
  createdAt: Date;
  lastSeenAt: Date;
}

/** Keys stored on User.notificationPreferences — must stay aligned with
 * frontend NotificationPreferences and users.validation.ts. */
type PrefKey =
  | 'newMessage'
  | 'adViews'
  | 'favAdUpdated'
  | 'promotions'
  | 'myPromotions'
  | 'savedSearch'
  | 'storeUpdates'
  | 'serviceQuotes';

/** Same defaults as NotificationSettingsForm — used when a key is missing
 * from the JSON blob (older accounts). */
const DEFAULT_PREFS: Record<PrefKey, boolean> = {
  newMessage: true,
  adViews: false,
  favAdUpdated: true,
  promotions: false,
  myPromotions: true,
  savedSearch: true,
  storeUpdates: true,
  serviceQuotes: true,
};

function readPref(raw: unknown, key: PrefKey): boolean {
  if (raw && typeof raw === 'object' && key in (raw as object)) {
    return Boolean((raw as Record<string, unknown>)[key]);
  }
  return DEFAULT_PREFS[key];
}

/** Returns the subset of userIds whose notificationPreferences allow `key`. */
async function filterUserIdsByPref(userIds: string[], key: PrefKey): Promise<string[]> {
  if (userIds.length === 0) return [];
  const unique = Array.from(new Set(userIds));
  const rows = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, notificationPreferences: true },
  });
  return rows.filter((u) => readPref(u.notificationPreferences, key)).map((u) => u.id);
}

// FIX NOTIF-USER-PREF-HOT-PATH-01: dedicated single-user path instead
// of reusing filterUserIdsByPref's batch shape (Array.from(new Set([x]))
// + findMany + filter + map). This is called on every new message, new
// quote, quote accepted, new offer, offer accepted, and store invite —
// the six hottest notification paths in the app — so the small
// inefficiencies added up. findUnique + readPref is one indexed lookup
// plus a single key read; no Set construction, no array iteration,
// no accidental "returns false for a missing user" being inferred from
// an empty array after a full round trip through the batch helper.
async function userAllowsPref(userId: string, key: PrefKey): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationPreferences: true },
  });
  if (!user) return false;
  return readPref(user.notificationPreferences, key);
}

// Per-process cooldown (best-effort; resets on restart / not shared across instances).
const TEST_PUSH_COOLDOWN_MS = 20_000;
const testPushLastSent = new Map<string, number>();

export const notificationsService = {
  getMyNotifications: async (
    userId: string,
    query: {
      page?: number;
      limit?: number;
      unreadOnly?: boolean;
      type?: string;
      category?: string;
    }
  ): Promise<PaginatedResult<Notification>> => {
    let types: NotificationType[] | undefined;
    if (query.type) {
      types = [query.type as NotificationType];
    } else if (query.category) {
      const map: Record<string, NotificationType[]> = {
        messages: ['NEW_MESSAGE'],
        favorites: ['FAV_AD_PRICE_CHANGED', 'FAV_AD_SOLD', 'SAVED_SEARCH_MATCH'],
        stores: [
          'STORE_NEW_PRODUCT',
          'STORE_PROMOTION_STARTED',
          'STORE_PRODUCT_RESTOCKED',
          'PROMOTION_STATUS_CHANGE',
          'STORE_MEMBER_INVITED',
        ],
        services: [
          'NEW_SERVICE_QUOTE',
          'SERVICE_QUOTE_ACCEPTED',
          'NEW_REQUEST_OFFER',
          'REQUEST_OFFER_ACCEPTED',
          'SERVICE_REQUEST_NEW',
          'SERVICE_REQUEST_UPDATE',
          'APPOINTMENT_UPDATE',
        ],
        system: [
          'PROMOTION',
          'WEEKLY_AD_VIEWS_REPORT',
          'WEEKLY_STORE_VIEWS_REPORT',
          'WEEKLY_SERVICE_VIEWS_REPORT',
        ],
      };
      types = map[query.category];
    }
    const { notifications, total } = await notificationsRepository.findManyForUser(userId, {
      page: query.page,
      limit: query.limit,
      unreadOnly: query.unreadOnly,
      types,
    });
    return {
      items: notifications,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  getUnreadCount: (userId: string): Promise<number> =>
    notificationsRepository.countUnreadForUser(userId),

  markRead: async (userId: string, id: string): Promise<void> => {
    const result = await notificationsRepository.markRead(id, userId);
    if (result.count === 0) {
      throw new NotFoundError('Notification not found', 'NOTIFICATION_NOT_FOUND');
    }
  },

  markUnread: async (userId: string, id: string): Promise<void> => {
    const result = await notificationsRepository.markUnread(id, userId);
    if (result.count === 0) {
      throw new NotFoundError('Notification not found', 'NOTIFICATION_NOT_FOUND');
    }
  },

  markAllRead: async (userId: string): Promise<number> => {
    const result = await notificationsRepository.markAllRead(userId);
    return result.count;
  },

  /**
   * Admin-only manual broadcast (POST /admin/notifications/broadcast) —
   * covers the PROMOTION type ("عروض وتخفيضات" / "نشرة أخبار سوق غزة").
   * There is deliberately no automatic trigger for this type; someone
   * on the team decides to send one and does so explicitly. userIds is
   * required rather than an implicit "everyone" to keep the blast
   * radius of a mistaken call bounded and explicit at the call site —
   * the controller resolves "all active users" into a concrete id list
   * before calling this, it isn't a magic empty-array meaning.
   */
  broadcastPromotion: async (userIds: string[], title: string, body: string): Promise<number> => {
    if (userIds.length === 0) return 0;

    // FIX NOTIF-BROADCAST-CHUNK-01: process in bounded slices instead
    // of holding one giant recipients array and one giant INSERT. The
    // caller (admin controller) resolves "all active users" into a
    // concrete id list — realistic Gaza-market scale is thousands
    // today, but the previous implementation would break at 100K:
    //   - filterUserIdsByPref issued a single WHERE id IN (100K) query
    //   - createMany inserted all 100K rows in one transaction (a
    //     single failure rolled back the whole broadcast, and the
    //     insert itself can exhaust the DB connection timeout on
    //     Neon/Render Free)
    //   - pushService.notifyUsers enqueued 100K/10 = 10K chunks back
    //     to back
    // 500 per slice keeps each query and insert small enough to finish
    // inside the request timeout, keeps memory bounded (only one
    // slice's worth of user rows resident at a time), and lets a
    // failing slice surface in the returned count without losing the
    // slices that already succeeded.
    const BROADCAST_CHUNK_SIZE = 500;
    const unique = Array.from(new Set(userIds));
    let totalCreated = 0;
    // NOTIF-BROADCAST-PUSH-SERIAL-01: each slice used to fire its own
    // un-awaited pushService.notifyUsers, so N slices ran N fan-outs in
    // parallel (each already chunked by 10) — 10K users meant ~20
    // concurrent fan-outs against the pool and the push services. Chain
    // them so only one slice's push is in flight at a time; the HTTP
    // request still returns after the in-app rows are written.
    let pushChain: Promise<void> = Promise.resolve();

    for (let i = 0; i < unique.length; i += BROADCAST_CHUNK_SIZE) {
      const slice = unique.slice(i, i + BROADCAST_CHUNK_SIZE);
      const recipients = await filterUserIdsByPref(slice, 'promotions');
      if (recipients.length === 0) continue;

      // In-app rows first, then push (a push never refers to a row that
      // failed to insert). Web Push + FCM stay fire-and-forget.
      const result = await notificationsRepository.createMany(
        recipients.map((userId) => ({ userId, type: 'PROMOTION' as const, title, body }))
      );
      totalCreated += result.count;

      pushChain = pushChain
        .then(() =>
          pushService.notifyUsers(recipients, {
            title,
            body,
            url: '/notifications',
            tag: 'platform-promotion',
            type: 'PROMOTION',
          })
        )
        .catch(() => undefined);
    }

    void pushChain;
    return totalCreated;
  },

  /** FIX PWA-PUSH-01: called from POST /notifications/push-subscriptions
   * — see notifications.repository.ts's upsertPushSubscription for why
   * this is an upsert-on-endpoint rather than a plain create. */
  subscribeToPush: (
    userId: string,
    input: PushSubscriptionInput,
    userAgent?: string
  ): Promise<void> =>
    notificationsRepository
      .upsertPushSubscription(userId, input, labelFromUserAgent(userAgent))
      .then(() => undefined),

  /** FIX PWA-PUSH-01: called from DELETE /notifications/push-subscriptions
   * — best-effort, see repository method's own doc comment on why a
   * 0-row result isn't treated as NotFound here (unlike markRead). */
  unsubscribeFromPush: (userId: string, endpoint: string): Promise<void> =>
    notificationsRepository.deletePushSubscription(userId, endpoint).then(() => undefined),

  /**
   * POST /notifications/push-test — explicit "send me a test" from settings.
   * Bypasses quiet hours (the user asked for it) but is rate-limited per user.
   * Returns how many devices were targeted; 0 means nothing is registered, so
   * the UI can say so instead of waiting for a banner that will never come.
   * Note: "targeted" ≠ "delivered" — the push service gives no device receipt.
   */
  sendTestPush: async (userId: string): Promise<{ devices: number }> => {
    const now = Date.now();
    const last = testPushLastSent.get(userId) ?? 0;
    if (now - last < TEST_PUSH_COOLDOWN_MS) {
      throw new TooManyRequestsError('Test push was sent recently', 'TEST_PUSH_COOLDOWN');
    }
    const [web, native] = await Promise.all([
      pushSubscriptionsRepository.findManyByUserId(userId),
      fcmDeviceTokensRepository.findManyByUserId(userId),
    ]);
    const devices = web.length + native.length;
    if (devices === 0) return { devices: 0 };
    testPushLastSent.set(userId, now);
    if (testPushLastSent.size > 5000) {
      for (const [k, t] of testPushLastSent) if (now - t > TEST_PUSH_COOLDOWN_MS) testPushLastSent.delete(k);
    }
    await pushService.notifyUser(userId, {
      title: 'إشعار تجريبي',
      body: 'إذا ظهر لك هذا الإشعار فإشعارات هذا الجهاز تعمل.',
      url: '/notifications',
      tag: 'push-test',
      urgent: true,
      bypassQuietHours: true,
      type: 'TEST',
    });
    return { devices };
  },

  /** NEW — called from POST /notifications/fcm-tokens (Capacitor native
   * push registration). Mirrors subscribeToPush above. */
  registerFcmToken: (userId: string, input: RegisterFcmTokenInput): Promise<void> =>
    notificationsRepository
      .upsertFcmDeviceToken(userId, input, labelForNativePlatform(input.platform))
      .then(() => undefined),

  /** GET /notifications/devices — every browser + native registration of the caller, newest activity first. */
  listDevices: async (userId: string): Promise<NotificationDevice[]> => {
    const [web, native] = await Promise.all([
      pushSubscriptionsRepository.listForUser(userId),
      fcmDeviceTokensRepository.listForUser(userId),
    ]);
    const devices: NotificationDevice[] = [
      ...web.map((d) => ({
        id: d.id,
        kind: 'web' as const,
        label: d.label,
        platform: null,
        fingerprint: deviceFingerprint(d.endpoint),
        createdAt: d.createdAt,
        lastSeenAt: d.lastSeenAt,
      })),
      ...native.map((d) => ({
        id: d.id,
        kind: 'native' as const,
        label: d.label,
        platform: d.platform,
        fingerprint: deviceFingerprint(d.token),
        createdAt: d.createdAt,
        lastSeenAt: d.lastSeenAt,
      })),
    ];
    return devices.sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
  },

  /** PATCH /notifications/devices/:kind/:id — rename one of the caller's devices. */
  renameDevice: async (userId: string, kind: DeviceKind, id: string, label: string): Promise<void> => {
    const repo = kind === 'web' ? pushSubscriptionsRepository : fcmDeviceTokensRepository;
    const result = await repo.renameForUser(userId, id, label);
    if (result.count === 0) throw new NotFoundError('Device not found', 'DEVICE_NOT_FOUND');
  },

  /** DELETE /notifications/devices/:kind/:id — stop pushing to one of the caller's devices. */
  removeDevice: async (userId: string, kind: DeviceKind, id: string): Promise<void> => {
    const repo = kind === 'web' ? pushSubscriptionsRepository : fcmDeviceTokensRepository;
    const result = await repo.deleteByIdForUser(userId, id);
    if (result.count === 0) throw new NotFoundError('Device not found', 'DEVICE_NOT_FOUND');
  },

  /** NEW — called from DELETE /notifications/fcm-tokens. Mirrors
   * unsubscribeFromPush above (best-effort, 0-row result not treated as error). */
  unregisterFcmToken: (userId: string, token: string): Promise<void> =>
    notificationsRepository.deleteFcmDeviceToken(userId, token).then(() => undefined),

  /** Opens a chat thread → clear NEW_MESSAGE bell rows for that conversation. */
  markConversationNotificationsRead: (userId: string, conversationId: string) =>
    notificationsRepository.markUnreadNewMessagesForConversation(userId, conversationId),

  deleteNotification: async (userId: string, id: string): Promise<void> => {
    const result = await notificationsRepository.deleteForUser(id, userId);
    if (result.count === 0) {
      throw new NotFoundError('Notification not found', 'NOTIFICATION_NOT_FOUND');
    }
  },

  deleteAllRead: async (userId: string): Promise<number> => {
    const result = await notificationsRepository.deleteAllReadForUser(userId);
    return result.count;
  },

  /**
   * Admin snapshot: volume by type + unread share over the last N days.
   * Read-only aggregates for the analytics dashboard.
   */
  getAdminStats: async (days = 30) => {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [byType, unreadTotal, totalInWindow] = await Promise.all([
      prisma.notification.groupBy({
        by: ['type'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.notification.count({ where: { readAt: null, createdAt: { gte: since } } }),
      prisma.notification.count({ where: { createdAt: { gte: since } } }),
    ]);
    return {
      days,
      total: totalInWindow,
      unread: unreadTotal,
      readRate:
        totalInWindow === 0
          ? null
          : Math.round(((totalInWindow - unreadTotal) / totalInWindow) * 1000) / 10,
      byType: byType
        .map((row) => ({ type: row.type, count: row._count._all }))
        .sort((a, b) => b.count - a.count),
    };
  },
};

/**
 * Event-triggered generators — called from other modules' services, not
 * from this module's own controller. Kept here (rather than as inline
 * repository calls scattered in conversations.service.ts / ads.service.ts)
 * so every notification-producing event is discoverable from one file.
 * Each is fire-and-forget from the caller's perspective: a notification
 * failing to write should never fail the underlying action (a message
 * still sends even if the notification insert has a transient error) —
 * so callers should not await these inside the same transaction as the
 * primary write, and should swallow/log rather than propagate a failure.
 */

// FIX SEC-4.5: onFavoritedAdPriceChanged, onSavedSearchMatched, and
// onStoreNewProduct all repeated the same shape — bail out on an empty
// recipient list, fire a push, then createMany the in-app rows —
// differing only in whether the push/notification content is the same
// for every recipient (price-changed, new-product: one shared
// pushService.notifyUsers call) or varies per recipient (saved-search
// match, which needs each recipient's own savedSearchId/label in the
// tag and copy: one pushService.notifyUser call each). This helper
// covers the "same content for everyone" shape; onSavedSearchMatched's
// per-recipient variant is left inline since collapsing it in here
// would just move the branching rather than remove it.
async function fanOutSameContentNotification(
  userIds: string[],
  type: NotificationType,
  content: { title: string; body: string; data: Prisma.InputJsonValue },
  pushUrl: string,
  pushTag: string,
  prefKey?: PrefKey,
  pushImage?: string
): Promise<{ count: number }> {
  const recipients = prefKey ? await filterUserIdsByPref(userIds, prefKey) : userIds;
  if (recipients.length === 0) return { count: 0 };
  const { title, body, data } = content;
  void pushService
    .notifyUsers(recipients, {
      title,
      body,
      url: pushUrl,
      tag: pushTag,
      type,
      ...(pushImage ? { image: pushImage } : {}),
    })
    .catch(() => {});
  return notificationsRepository.createMany(
    recipients.map((userId) => ({ userId, type, title, body, data }))
  );
}

type ServiceRequestActor = 'customer' | 'provider';

/** Arabic copy per status. `to` is the party being notified. */
const SERVICE_REQUEST_COPY: Record<
  string,
  Partial<Record<ServiceRequestActor, { title: string; body: (t: string) => string }>>
> = {
  ACCEPTED: { customer: { title: 'تم قبول طلبك', body: (t) => `قبل مقدم الخدمة طلبك على "${t}" — اطّلع على السعر المقترح` } },
  REJECTED: { customer: { title: 'تم رفض طلبك', body: (t) => `اعتذر مقدم الخدمة عن طلبك على "${t}"` } },
  IN_PROGRESS: { customer: { title: 'بدأ تنفيذ طلبك', body: (t) => `بدأ مقدم الخدمة العمل على طلبك "${t}"` } },
  COMPLETED: { customer: { title: 'اكتمل طلبك', body: (t) => `اكتمل طلبك "${t}" — يمكنك الآن تقييم الخدمة` } },
  // CANCELLED is symmetrical: the recipient is whoever did NOT cancel.
  CANCELLED: {
    customer: { title: 'تم إلغاء الطلب', body: (t) => `ألغى مقدم الخدمة الطلب على "${t}"` },
    provider: { title: 'تم إلغاء الطلب', body: (t) => `ألغى العميل طلبه على "${t}"` },
  },
};

const formatGazaDateTime = (d: Date): string => {
  try {
    return new Intl.DateTimeFormat('ar', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Gaza',
    }).format(d);
  } catch {
    return d.toISOString();
  }
};

/** Running unread-message count stored on a NEW_MESSAGE row's `data.count`. */
const unreadMessageCount = (data: unknown): number => {
  const raw = data && typeof data === 'object' ? (data as Record<string, unknown>).count : undefined;
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;
};

export const notificationEvents = {
  /** Seller-facing lifecycle warning, emitted once per ad. */
  onAdExpiringSoon: async (userId: string, adId: string, adTitle: string, expiresAt: Date): Promise<void> => {
    const title = 'إعلانك يقترب من الانتهاء';
    const body = `سينتهي إعلان "${adTitle}" خلال 7 أيام تقريبًا`;
    const data = { adId, expiresAt: expiresAt.toISOString(), event: 'expiring' };
    await notificationsRepository.create({ userId, type: 'AD_EXPIRING_SOON', title, body, data });
    void pushService.notifyUser(userId, { title, body, url: `/ads/${adId}`, tag: `ad-expiry-${adId}`, type: 'AD_EXPIRING_SOON' }).catch(() => {});
  },

  /** Seller-facing terminal lifecycle event. */
  onAdExpired: async (userId: string, adId: string, adTitle: string): Promise<void> => {
    const title = 'انتهى إعلانك';
    const body = `انتهت مدة نشر "${adTitle}". يمكنك تجديده من إعلاناتك.`;
    const data = { adId, event: 'expired' };
    await notificationsRepository.create({ userId, type: 'AD_EXPIRED', title, body, data });
    void pushService.notifyUser(userId, { title, body, url: `/ads/${adId}`, tag: `ad-expired-${adId}`, type: 'AD_EXPIRED' }).catch(() => {});
  },

  /** Moderation queue: every moderator/admin gets a durable in-app row and a push. */
  onModerationReportReceived: async (input: {
    reportId: string;
    targetType: string;
    targetId: string;
    targetLabel: string;
    autoHidden: boolean;
  }): Promise<{ count: number }> => {
    const moderators = await prisma.user.findMany({
      where: { role: { in: ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true },
    });
    const userIds = moderators.map((m) => m.id);
    if (userIds.length === 0) return { count: 0 };
    const title = input.autoHidden ? 'تم إخفاء محتوى تلقائيًا' : 'بلاغ جديد يحتاج مراجعة';
    const body = `${input.targetLabel} تلقى بلاغًا جديدًا${input.autoHidden ? ' وتم إخفاؤه مؤقتًا' : ''}`;
    const data = { reportId: input.reportId, targetType: input.targetType, targetId: input.targetId };
    void pushService.notifyUsers(userIds, {
      title, body, url: '/admin?tab=reports', tag: `report-${input.reportId}`, type: 'MODERATION_REPORT_RECEIVED',
    }).catch(() => {});
    return notificationsRepository.createMany(userIds.map((userId) => ({
      userId, type: 'MODERATION_REPORT_RECEIVED' as const, title, body, data,
    })));
  },


  /** Report outcome for the reporter and, for ad reports, the affected owner. */
  onModerationDecision: async (input: {
    userIds: string[]; reportId: string; targetType: string; targetId: string; status: string; targetTitle: string;
  }): Promise<{ count: number }> => {
    const resolved = input.status === 'RESOLVED';
    const title = resolved ? 'تمت مراجعة البلاغ' : 'تمت مراجعة البلاغ';
    const body = resolved
      ? `تم اتخاذ إجراء بشأن البلاغ المتعلق بـ"${input.targetTitle}"`
      : `تمت مراجعة البلاغ المتعلق بـ"${input.targetTitle}" دون إجراء نشر جديد`;
    const data = { reportId: input.reportId, targetType: input.targetType, targetId: input.targetId, status: input.status };
    void pushService.notifyUsers(input.userIds, {
      title, body, url: '/notifications', tag: `moderation-${input.reportId}`, type: 'MODERATION_DECISION',
    }).catch(() => {});
    return notificationsRepository.createMany(input.userIds.map((userId) => ({
      userId, type: 'MODERATION_DECISION' as const, title, body, data,
    })));
  },

  /** conversations.service.ts's sendMessage calls this after a message
   * is created — notifies the OTHER party in the thread, never the
   * sender. */
  onNewMessage: async (recipientUserId: string, conversationId: string, senderName: string) => {
    if (!(await userAllowsPref(recipientUserId, 'newMessage'))) return null;
    const title = 'رسالة جديدة';
    const body = `${senderName} أرسل لك رسالة`;
    // The in-app row is written first: it carries the running count of
    // unread messages in this conversation (see createOrRefreshNewMessage),
    // which the push banner needs for its grouped copy. A failed row write
    // therefore no longer sends a push that points at nothing.
    const row = await notificationsRepository.createOrRefreshNewMessage({
      userId: recipientUserId,
      conversationId,
      title,
      body,
    });
    const count = unreadMessageCount(row.data);
    void pushService.notifyUser(recipientUserId, {
      title: count > 1 ? `${count} رسائل جديدة` : title,
      body: count > 1 ? `${count} رسائل من ${senderName}` : body,
      url: `/messages/${conversationId}`,
      tag: `conversation-${conversationId}`,
      urgent: true,
      type: 'NEW_MESSAGE',
    }).catch(() => {});
    return row;
  },

  /** ads.service.ts's updateAd calls this after a price change on an ad
   * that has at least one favoriter — one notification per favoriter,
   * fanned out via createMany. */
  onFavoritedAdPriceChanged: (
    favoriterUserIds: string[],
    adId: string,
    adTitle: string,
    imageUrl?: string
  ): Promise<{ count: number }> =>
    fanOutSameContentNotification(
      favoriterUserIds,
      'FAV_AD_PRICE_CHANGED',
      { title: 'تغيّر سعر إعلان في المفضلة', body: `تم تحديث سعر "${adTitle}"`, data: { adId } },
      `/ads/${adId}`,
      `ad-${adId}`,
      'favAdUpdated',
      imageUrl
    ),

  /** ads.service.ts's updateAd calls this after an ACTIVE -> SOLD
   * transition on an ad that has at least one favoriter — same
   * one-row-per-favoriter fan-out shape as onFavoritedAdPriceChanged,
   * just keyed by the SOLD transition instead of a price change (and
   * fired from the same justSold block that already handles the
   * SellerProfile stat bump, guarded the same way: only on that exact
   * transition, never re-fired on a later no-op update). */
  onFavoritedAdSold: (
    favoriterUserIds: string[],
    adId: string,
    adTitle: string,
    imageUrl?: string
  ): Promise<{ count: number }> =>
    fanOutSameContentNotification(
      favoriterUserIds,
      'FAV_AD_SOLD',
      { title: 'تم بيع إعلان في المفضلة', body: `تم بيع "${adTitle}"`, data: { adId } },
      `/ads/${adId}`,
      `ad-${adId}`,
      'favAdUpdated',
      imageUrl
    ),

  /** saved-searches.service.ts's onAdCreated/onProductCreated/
   * onServiceListingCreated call this after finding every SavedSearch a
   * newly created ad/product/service listing matches — one notification
   * per (user, savedSearch) match, fanned out via createMany. A user
   * with two saved searches that both match the same entity gets two
   * notifications, one per search, since each carries a different
   * savedSearchId/label context ("your search 'iPhone in Deir al-Balah'
   * matched a new ad" reads differently from "your search 'used
   * laptops under 500' matched a new ad" even for the same underlying
   * ad) — the same one-row-per-recipient shape as
   * onFavoritedAdPriceChanged, just keyed by search match instead of
   * favorite, and NOT folded into fanOutSameContentNotification because
   * the push/notification content genuinely differs per recipient here
   * (each needs its own savedSearchId/label), unlike that helper's
   * single-shared-content assumption.
   *
   * PLATFORM-WIDE-01: `entity` replaces the old (adId, adTitle) pair so
   * this one function serves all three saved-search types — the
   * link/wording only depends on entity.type, everything else about the
   * fan-out is identical regardless of what kind of listing matched.
   * `data` keeps the old `adId` key for type 'ad' (existing clients/
   * notification-history UI already read that key) and adds
   * productId/listingId for the other two types rather than a generic
   * `entityId`, so a notification's `data` shape stays self-describing
   * without needing `type` cross-referenced to know which key to
   * read. */
  onSavedSearchMatched: async (
    matches: { userId: string; savedSearchId: string; label: string }[],
    entity: { type: 'ad' | 'product' | 'service'; id: string; title: string }
  ): Promise<{ count: number }> => {
    if (matches.length === 0) return { count: 0 };
    const allowedIds = new Set(await filterUserIdsByPref(matches.map((m) => m.userId), 'savedSearch'));
    matches = matches.filter((m) => allowedIds.has(m.userId));
    if (matches.length === 0) return { count: 0 };

    const { url, entityData, title } = ((): {
      url: string;
      entityData: Record<string, string>;
      title: string;
    } => {
      switch (entity.type) {
        case 'product':
          return {
            url: `/products/${entity.id}`,
            entityData: { productId: entity.id },
            title: 'منتج جديد يطابق بحثك المحفوظ',
          };
        case 'service':
          return {
            // ROUTE-FIX-01: was /service-listings/:id — no such frontend page (404).
            url: `/services/${entity.id}`,
            entityData: { listingId: entity.id },
            title: 'خدمة جديدة تطابق بحثك المحفوظ',
          };
        case 'ad':
        default:
          return {
            url: `/ads/${entity.id}`,
            entityData: { adId: entity.id },
            title: 'إعلان جديد يطابق بحثك المحفوظ',
          };
      }
    })();

    // FIX PWA-PUSH-01: one push per match, same one-row-per-recipient
    // reasoning as the in-app notification below — a user with two
    // matching saved searches gets two pushes, each naming its own
    // search label, not one generic push. AUDIT-FIX 2.1: safe to leave
    // un-awaited, same reasoning as fanOutSameContentNotification above.
    // FIX NOTIF-PUSH-CATCH: every other fire-and-forget push call in
    // this file terminates with .catch(() => {}) — this one did not,
    // so a rejection from any of the notifyUser promises would surface
    // as an unhandled rejection at the process level (Node 15+ warns;
    // some deployments configure it to crash). Same contract as the
    // other handlers: push failure must never affect the notification
    // row we are about to write.
    void Promise.all(
      matches.map(({ userId, savedSearchId, label }) =>
        pushService.notifyUser(userId, {
          title,
          body: `"${entity.title}" يطابق بحثك المحفوظ "${label}"`,
          url,
          tag: `saved-search-${savedSearchId}`,
          type: 'SAVED_SEARCH_MATCH',
        })
      )
    ).catch(() => {});
    return notificationsRepository.createMany(
      matches.map(({ userId, savedSearchId, label }) => ({
        userId,
        type: 'SAVED_SEARCH_MATCH' as const,
        title,
        body: `"${entity.title}" يطابق بحثك المحفوظ "${label}"`,
        data: { ...entityData, savedSearchId },
      }))
    );
  },

  /** products.service.ts's createProduct calls this after a new product
   * is published — one notification per store follower, fanned out via
   * createMany. Same shape as onFavoritedAdPriceChanged, just keyed by
   * store follow instead of ad favorite. */
  onStoreNewProduct: (
    followerUserIds: string[],
    storeId: string,
    storeName: string,
    productName: string
  ): Promise<{ count: number }> =>
    fanOutSameContentNotification(
      followerUserIds,
      'STORE_NEW_PRODUCT',
      { title: 'منتج جديد', body: `متجر "${storeName}" أضاف منتجًا جديدًا: ${productName}`, data: { storeId } },
      `/stores/${storeId}`,
      `store-${storeId}`,
      'storeUpdates'
    ),

  /** myPromotionsExpiring.ts's processStarted calls this alongside (not
   * instead of) the existing owner-facing PROMOTION_STATUS_CHANGE
   * notification, on the same SCHEDULED -> ACTIVE transition — one
   * notification per store follower. See STORE_PROMOTION_STARTED's
   * schema.prisma doc comment for why this is a separate type from
   * that one. */
  onStorePromotionStarted: (
    followerUserIds: string[],
    storeId: string,
    productName: string,
    promotionTitle: string,
    promotionId: string,
    productId: string
  ): Promise<{ count: number }> =>
    fanOutSameContentNotification(
      followerUserIds,
      'STORE_PROMOTION_STARTED',
      {
        title: 'عرض جديد',
        body: `عرض جديد على "${productName}": ${promotionTitle}`,
        data: { storeId, promotionId, productId },
      },
      `/products/${productId}`,
      `store-promotion-${promotionId}`,
      'storeUpdates'
    ),

  /** products.service.ts's updateProduct calls this after an
   * OUT_OF_STOCK -> (IN_STOCK | LIMITED) transition — one notification
   * per store follower. See STORE_PRODUCT_RESTOCKED's schema.prisma doc
   * comment for why followers (not a per-product wishlist) are the
   * audience for this first cut. Links to the store page, not a
   * product detail page — there is no public /products/:id route in
   * this frontend (only /my-store/products/:id/edit, owner-only), same
   * constraint onStorePromotionStarted above is already working within. */
  onStoreProductRestocked: (
    followerUserIds: string[],
    storeId: string,
    productId: string,
    productName: string
  ): Promise<{ count: number }> =>
    fanOutSameContentNotification(
      followerUserIds,
      'STORE_PRODUCT_RESTOCKED',
      {
        title: 'عودة للمخزون',
        body: `عاد المنتج "${productName}" للمخزون`,
        data: { storeId, productId },
      },
      `/products/${productId}`,
      `store-restock-${productId}`,
      'storeUpdates'
    ),

  /** store-members.service.ts's inviteMember calls this after a
   * PENDING member row is created — notifies the invited user. FIX
   * (audit #21): was TODO'd, never actually implemented. */
  onStoreMemberInvited: async (
    targetUserId: string,
    storeId: string,
    memberId: string,
    storeName: string
  ) => {
    if (!(await userAllowsPref(targetUserId, 'storeUpdates'))) return null;
    const title = 'دعوة انضمام لمتجر';
    const body = `تمت دعوتك للانضمام إلى فريق متجر \"${storeName}\"`;
    void pushService.notifyUser(targetUserId, {
      title,
      body,
      url: '/my-store?tab=members',
      tag: `store-invite-${memberId}`,
      type: 'STORE_MEMBER_INVITED',
    }).catch(() => {});
    return notificationsRepository.create({
      userId: targetUserId,
      type: 'STORE_MEMBER_INVITED',
      title,
      body,
      data: { storeId, memberId },
    });
  },

  /** Open Requests: customer receives a new offer on their request. */
  onNewRequestOffer: async (
    customerId: string,
    requestId: string,
    offerId: string,
    offererName: string,
    requestTitle: string
  ) => {
    if (!(await userAllowsPref(customerId, 'serviceQuotes'))) return null;
    const title = 'عرض جديد على طلبك';
    const body = `${offererName} أرسل عرضًا على طلبك "${requestTitle}"`;
    void pushService.notifyUser(customerId, {
      title,
      body,
      url: `/requests/${requestId}`,
      tag: `request-${requestId}`,
      type: 'NEW_REQUEST_OFFER',
    }).catch(() => {});
    return notificationsRepository.create({
      userId: customerId,
      type: 'NEW_REQUEST_OFFER',
      title,
      body,
      data: { requestId, offerId },
    });
  },

  /** Open Requests: offerer is notified their offer was accepted. */
  onRequestOfferAccepted: async (
    offererUserId: string,
    requestId: string,
    offerId: string,
    requestTitle: string
  ) => {
    if (!(await userAllowsPref(offererUserId, 'serviceQuotes'))) return null;
    const title = 'تم قبول عرضك';
    const body = `تم قبول عرضك على طلب "${requestTitle}"`;
    void pushService.notifyUser(offererUserId, {
      title,
      body,
      url: `/requests/${requestId}`,
      tag: `request-${requestId}`,
      type: 'REQUEST_OFFER_ACCEPTED',
    }).catch(() => {});
    return notificationsRepository.create({
      userId: offererUserId,
      type: 'REQUEST_OFFER_ACCEPTED',
      title,
      body,
      data: { requestId, offerId },
    });
  },

  /** Provider is notified a customer opened a request on their listing. */
  onServiceRequestCreated: async (
    providerUserId: string,
    requestId: string,
    listingTitle: string,
    customerId: string
  ) => {
    if (!(await userAllowsPref(providerUserId, 'serviceQuotes'))) return null;
    const customerName =
      (await prisma.user.findUnique({ where: { id: customerId }, select: { name: true } }))?.name ??
      'عميل';
    const title = 'طلب خدمة جديد';
    const body = `${customerName} أرسل طلبًا على "${listingTitle}"`;
    void pushService.notifyUser(providerUserId, {
      title,
      body,
      url: `/service-requests/${requestId}`,
      tag: `service-request-${requestId}`,
      type: 'SERVICE_REQUEST_NEW',
    }).catch(() => {});
    return notificationsRepository.create({
      userId: providerUserId,
      type: 'SERVICE_REQUEST_NEW',
      title,
      body,
      data: { requestId },
    });
  },

  /** The OTHER party (not the actor) is told the request changed state.
   * Statuses without copy for that recipient (e.g. a customer never
   * receives "PENDING") are skipped silently. */
  onServiceRequestStatusChanged: async (
    recipientUserId: string,
    recipientRole: ServiceRequestActor,
    requestId: string,
    listingTitle: string,
    status: string
  ) => {
    const copy = SERVICE_REQUEST_COPY[status]?.[recipientRole];
    if (!copy) return null;
    if (!(await userAllowsPref(recipientUserId, 'serviceQuotes'))) return null;
    const title = copy.title;
    const body = copy.body(listingTitle);
    void pushService.notifyUser(recipientUserId, {
      title,
      body,
      url: `/service-requests/${requestId}`,
      tag: `service-request-${requestId}`,
      type: 'SERVICE_REQUEST_UPDATE',
    }).catch(() => {});
    return notificationsRepository.create({
      userId: recipientUserId,
      type: 'SERVICE_REQUEST_UPDATE',
      title,
      body,
      data: { requestId, status },
    });
  },

  /** FIX SR-EXPIRY (audit H4): customer is told their unanswered request
   * was closed automatically. Reuses the SERVICE_REQUEST_UPDATE type and
   * the `serviceQuotes` preference, same as every other request update. */
  /** FIX SR-EXPIRY-SIG (audit H4): ttlDays is interpolated into the body. */
  onServiceRequestExpired: async (
    customerUserId: string,
    requestId: string,
    listingTitle: string,
    ttlDays: number
  ) => {
    if (!(await userAllowsPref(customerUserId, 'serviceQuotes'))) return null;
    const title = 'انتهت مهلة طلبك';
    // FIX SR-EXPIRY-BODY (audit H4): no hardcoded 7 — follows the TTL constant.
    const body = `لم يردّ مقدم الخدمة على طلبك \"${listingTitle}\" خلال ${ttlDays} أيام فتم إغلاقه — يمكنك تقديم طلب جديد أو اختيار مقدم خدمة آخر`;
    void pushService.notifyUser(customerUserId, {
      title,
      body,
      url: `/service-requests/${requestId}`,
      tag: `service-request-${requestId}`,
      type: 'SERVICE_REQUEST_UPDATE',
    }).catch(() => {});
    return notificationsRepository.create({
      userId: customerUserId,
      type: 'SERVICE_REQUEST_UPDATE',
      title,
      body,
      // FIX SR-EXPIRY-DATA (audit H4): the row itself is EXPIRED now.
      data: { requestId, status: 'EXPIRED' },
    });
  },

  /** Customer is told an appointment tied to their request was booked
   * or cancelled by the provider. */
  onAppointmentChanged: async (
    customerUserId: string,
    requestId: string,
    listingTitle: string,
    kind: 'booked' | 'cancelled',
    scheduledStart: Date
  ) => {
    if (!(await userAllowsPref(customerUserId, 'serviceQuotes'))) return null;
    const when = formatGazaDateTime(scheduledStart);
    const title = kind === 'booked' ? 'تم حجز موعد' : 'تم إلغاء الموعد';
    const body =
      kind === 'booked'
        ? `تم تحديد موعد لطلبك "${listingTitle}" — ${when}`
        : `أُلغي الموعد المحدد لطلبك "${listingTitle}" (${when})`;
    void pushService.notifyUser(customerUserId, {
      title,
      body,
      url: `/service-requests/${requestId}`,
      tag: `service-request-${requestId}`,
      type: 'APPOINTMENT_UPDATE',
    }).catch(() => {});
    return notificationsRepository.create({
      userId: customerUserId,
      type: 'APPOINTMENT_UPDATE',
      title,
      body,
      data: { requestId },
    });
  },
};
