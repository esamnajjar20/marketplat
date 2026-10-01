import { Notification, NotificationType, Prisma } from '@prisma/client';
import { notificationsRepository, PushSubscriptionInput, RegisterFcmTokenInput } from './notifications.repository';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { pushService } from '../../shared/utils/pushService';
import { prisma } from '../../config/prisma';

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
        services: ['NEW_SERVICE_QUOTE', 'SERVICE_QUOTE_ACCEPTED', 'NEW_REQUEST_OFFER', 'REQUEST_OFFER_ACCEPTED'],
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

    for (let i = 0; i < unique.length; i += BROADCAST_CHUNK_SIZE) {
      const slice = unique.slice(i, i + BROADCAST_CHUNK_SIZE);
      const recipients = await filterUserIdsByPref(slice, 'promotions');
      if (recipients.length === 0) continue;

      // Web Push + in-app — same fire-and-forget convention as
      // notificationEvents. Admin broadcast is the PROMOTION path that
      // previously only wrote in-app rows; weekly reports and store
      // promotion lifecycle already call pushService from their scripts.
      void pushService
        .notifyUsers(recipients, {
          title,
          body,
          url: '/notifications',
          tag: 'platform-promotion',
        })
        .catch(() => {});

      const result = await notificationsRepository.createMany(
        recipients.map((userId) => ({ userId, type: 'PROMOTION' as const, title, body }))
      );
      totalCreated += result.count;
    }

    return totalCreated;
  },

  /** FIX PWA-PUSH-01: called from POST /notifications/push-subscriptions
   * — see notifications.repository.ts's upsertPushSubscription for why
   * this is an upsert-on-endpoint rather than a plain create. */
  subscribeToPush: (userId: string, input: PushSubscriptionInput): Promise<void> =>
    notificationsRepository.upsertPushSubscription(userId, input).then(() => undefined),

  /** FIX PWA-PUSH-01: called from DELETE /notifications/push-subscriptions
   * — best-effort, see repository method's own doc comment on why a
   * 0-row result isn't treated as NotFound here (unlike markRead). */
  unsubscribeFromPush: (userId: string, endpoint: string): Promise<void> =>
    notificationsRepository.deletePushSubscription(userId, endpoint).then(() => undefined),

  /** NEW — called from POST /notifications/fcm-tokens (Capacitor native
   * push registration). Mirrors subscribeToPush above. */
  registerFcmToken: (userId: string, input: RegisterFcmTokenInput): Promise<void> =>
    notificationsRepository.upsertFcmDeviceToken(userId, input).then(() => undefined),

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
      ...(pushImage ? { image: pushImage } : {}),
    })
    .catch(() => {});
  return notificationsRepository.createMany(
    recipients.map((userId) => ({ userId, type, title, body, data }))
  );
}

export const notificationEvents = {
  /** conversations.service.ts's sendMessage calls this after a message
   * is created — notifies the OTHER party in the thread, never the
   * sender. */
  onNewMessage: async (recipientUserId: string, conversationId: string, senderName: string) => {
    if (!(await userAllowsPref(recipientUserId, 'newMessage'))) return null;
    const title = 'رسالة جديدة';
    const body = `${senderName} أرسل لك رسالة`;
    void pushService.notifyUser(recipientUserId, {
      title,
      body,
      url: `/messages/${conversationId}`,
      tag: `conversation-${conversationId}`,
      urgent: true,
    }).catch(() => {});
    return notificationsRepository.createOrRefreshNewMessage({
      userId: recipientUserId,
      conversationId,
      title,
      body,
    });
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
            url: `/service-listings/${entity.id}`,
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
    }).catch(() => {});
    return notificationsRepository.create({
      userId: offererUserId,
      type: 'REQUEST_OFFER_ACCEPTED',
      title,
      body,
      data: { requestId, offerId },
    });
  },
};
