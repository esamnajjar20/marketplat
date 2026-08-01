import { Notification } from '@prisma/client';
import { notificationsRepository } from './notifications.repository';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';

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
export const notificationEvents = {
  /** conversations.service.ts's sendMessage calls this after a message
   * is created — notifies the OTHER party in the thread, never the
   * sender. */
  onNewMessage: (recipientUserId: string, conversationId: string, senderName: string) =>
    notificationsRepository.create({
      userId: recipientUserId,
      type: 'NEW_MESSAGE',
      title: 'رسالة جديدة',
      body: `${senderName} أرسل لك رسالة`,
      data: { conversationId },
    }),

  /** ads.service.ts's updateAd calls this after a price change on an ad
   * that has at least one favoriter — one notification per favoriter,
   * fanned out via createMany. */
  onFavoritedAdPriceChanged: (
    favoriterUserIds: string[],
    adId: string,
    adTitle: string
  ): Promise<{ count: number }> => {
    if (favoriterUserIds.length === 0) return Promise.resolve({ count: 0 });
    return notificationsRepository.createMany(
      favoriterUserIds.map((userId) => ({
        userId,
        type: 'FAV_AD_PRICE_CHANGED' as const,
        title: 'تغيّر سعر إعلان في المفضلة',
        body: `تم تحديث سعر "${adTitle}"`,
        data: { adId },
      }))
    );
  },
};
