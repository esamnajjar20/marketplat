import { Notification, NotificationType, Prisma } from '@prisma/client';
import { notificationsRepository, PushSubscriptionInput } from './notifications.repository';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { pushService } from '../../shared/utils/pushService';

export const notificationsService = {
  getMyNotifications: async (
    userId: string,
    query: { page?: number; limit?: number; unreadOnly?: boolean }
  ): Promise<PaginatedResult<Notification>> => {
    const { notifications, total } = await notificationsRepository.findManyForUser(userId, query);
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
    const result = await notificationsRepository.createMany(
      userIds.map((userId) => ({ userId, type: 'PROMOTION' as const, title, body }))
    );
    return result.count;
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
function fanOutSameContentNotification(
  userIds: string[],
  type: NotificationType,
  content: { title: string; body: string; data: Prisma.InputJsonValue },
  pushUrl: string,
  pushTag: string
): Promise<{ count: number }> {
  if (userIds.length === 0) return Promise.resolve({ count: 0 });
  const { title, body, data } = content;
  // FIX PWA-PUSH-01: fire-and-forget, same convention as this whole
  // object's doc comment — a push failing to send must never affect
  // the in-app notification write below. AUDIT-FIX 2.1: safe to leave
  // un-awaited — pushService.notifyUser(s) catches every internal
  // failure and logs it, so this can never produce an unhandled
  // promise rejection.
  void pushService.notifyUsers(userIds, { title, body, url: pushUrl, tag: pushTag });
  return notificationsRepository.createMany(
    userIds.map((userId) => ({ userId, type, title, body, data }))
  );
}

export const notificationEvents = {
  /** conversations.service.ts's sendMessage calls this after a message
   * is created — notifies the OTHER party in the thread, never the
   * sender. */
  onNewMessage: (recipientUserId: string, conversationId: string, senderName: string) => {
    const title = 'رسالة جديدة';
    const body = `${senderName} أرسل لك رسالة`;
    // FIX PWA-PUSH-01: fire-and-forget, same convention as this whole
    // object's own doc comment above — a push failing to send must
    // never affect the in-app notification write this runs alongside,
    // so it isn't part of the returned promise chain.
    // AUDIT-FIX 2.1: pushService.notifyUser now catches every failure
    // internally (including a failed subscriptions lookup, which
    // previously had no guard) and logs it — this `void` call can never
    // produce an unhandled promise rejection.
    void pushService.notifyUser(recipientUserId, {
      title,
      body,
      url: `/messages/${conversationId}`,
      tag: `conversation-${conversationId}`,
    });
    return notificationsRepository.create({
      userId: recipientUserId,
      type: 'NEW_MESSAGE',
      title,
      body,
      data: { conversationId },
    });
  },

  /** ads.service.ts's updateAd calls this after a price change on an ad
   * that has at least one favoriter — one notification per favoriter,
   * fanned out via createMany. */
  onFavoritedAdPriceChanged: (
    favoriterUserIds: string[],
    adId: string,
    adTitle: string
  ): Promise<{ count: number }> =>
    fanOutSameContentNotification(
      favoriterUserIds,
      'FAV_AD_PRICE_CHANGED',
      { title: 'تغيّر سعر إعلان في المفضلة', body: `تم تحديث سعر "${adTitle}"`, data: { adId } },
      `/ads/${adId}`,
      `ad-${adId}`
    ),

  /** saved-searches.service.ts's onAdCreated calls this after finding
   * every SavedSearch a newly created ad matches — one notification per
   * (user, savedSearch) match, fanned out via createMany. A user with
   * two saved searches that both match the same ad gets two
   * notifications, one per search, since each carries a different
   * savedSearchId/label context ("your search 'iPhone in Deir al-Balah'
   * matched a new ad" reads differently from "your search 'used
   * laptops under 500' matched a new ad" even for the same underlying
   * ad) — the same one-row-per-recipient shape as
   * onFavoritedAdPriceChanged, just keyed by search match instead of
   * favorite, and NOT folded into fanOutSameContentNotification because
   * the push/notification content genuinely differs per recipient here
   * (each needs its own savedSearchId/label), unlike that helper's
   * single-shared-content assumption. */
  onSavedSearchMatched: (
    matches: { userId: string; savedSearchId: string; label: string }[],
    adId: string,
    adTitle: string
  ): Promise<{ count: number }> => {
    if (matches.length === 0) return Promise.resolve({ count: 0 });
    // FIX PWA-PUSH-01: one push per match, same one-row-per-recipient
    // reasoning as the in-app notification below — a user with two
    // matching saved searches gets two pushes, each naming its own
    // search label, not one generic push. AUDIT-FIX 2.1: safe to leave
    // un-awaited, same reasoning as fanOutSameContentNotification above.
    void Promise.all(
      matches.map(({ userId, savedSearchId, label }) =>
        pushService.notifyUser(userId, {
          title: 'إعلان جديد يطابق بحثك المحفوظ',
          body: `"${adTitle}" يطابق بحثك المحفوظ "${label}"`,
          url: `/ads/${adId}`,
          tag: `saved-search-${savedSearchId}`,
        })
      )
    );
    return notificationsRepository.createMany(
      matches.map(({ userId, savedSearchId, label }) => ({
        userId,
        type: 'SAVED_SEARCH_MATCH' as const,
        title: 'إعلان جديد يطابق بحثك المحفوظ',
        body: `"${adTitle}" يطابق بحثك المحفوظ "${label}"`,
        data: { adId, savedSearchId },
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
      `store-${storeId}`
    ),
};
