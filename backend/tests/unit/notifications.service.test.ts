import { notificationsService, notificationEvents } from '../../src/modules/notifications/notifications.service';
import { notificationsRepository } from '../../src/modules/notifications/notifications.repository';
import { pushService } from '../../src/shared/utils/pushService';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';

jest.mock('../../src/modules/notifications/notifications.repository');
jest.mock('../../src/shared/utils/pushService', () => ({
  pushService: {
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
  },
}));

const userId = 'user-1';

describe('notificationsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getMyNotifications', () => {
    it('returns paginated notifications with defaulted page/limit meta', async () => {
      (notificationsRepository.findManyForUser as jest.Mock).mockResolvedValue({
        notifications: [{ id: 'notif-1' }],
        total: 1,
      });

      const result = await notificationsService.getMyNotifications(userId, {});

      expect(result.items).toEqual([{ id: 'notif-1' }]);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });

    it('passes explicit page/limit/unreadOnly through to the repository and meta', async () => {
      (notificationsRepository.findManyForUser as jest.Mock).mockResolvedValue({
        notifications: [],
        total: 0,
      });

      const result = await notificationsService.getMyNotifications(userId, {
        page: 2,
        limit: 5,
        unreadOnly: true,
      });

      expect(notificationsRepository.findManyForUser).toHaveBeenCalledWith(userId, {
        page: 2,
        limit: 5,
        unreadOnly: true,
      });
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(5);
    });
  });

  describe('getUnreadCount', () => {
    it('returns the repository count directly', async () => {
      (notificationsRepository.countUnreadForUser as jest.Mock).mockResolvedValue(7);

      const result = await notificationsService.getUnreadCount(userId);

      expect(notificationsRepository.countUnreadForUser).toHaveBeenCalledWith(userId);
      expect(result).toBe(7);
    });
  });

  describe('markRead', () => {
    it('resolves without error when the update affects one row', async () => {
      (notificationsRepository.markRead as jest.Mock).mockResolvedValue({ count: 1 });

      await expect(notificationsService.markRead(userId, 'notif-1')).resolves.toBeUndefined();
      expect(notificationsRepository.markRead).toHaveBeenCalledWith('notif-1', userId);
    });

    it('throws NotFoundError when the update affects zero rows (wrong id or wrong owner)', async () => {
      (notificationsRepository.markRead as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(notificationsService.markRead(userId, 'notif-1')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('markAllRead', () => {
    it('returns the count of notifications marked read', async () => {
      (notificationsRepository.markAllRead as jest.Mock).mockResolvedValue({ count: 4 });

      const result = await notificationsService.markAllRead(userId);

      expect(notificationsRepository.markAllRead).toHaveBeenCalledWith(userId);
      expect(result).toBe(4);
    });

    it('returns 0 when there was nothing unread', async () => {
      (notificationsRepository.markAllRead as jest.Mock).mockResolvedValue({ count: 0 });

      const result = await notificationsService.markAllRead(userId);

      expect(result).toBe(0);
    });
  });

  describe('broadcastPromotion', () => {
    it('returns 0 without calling the repository when userIds is empty', async () => {
      const result = await notificationsService.broadcastPromotion([], 'عنوان', 'نص');

      expect(result).toBe(0);
      expect(notificationsRepository.createMany).not.toHaveBeenCalled();
    });

    it('fans out a PROMOTION notification to every given userId', async () => {
      (notificationsRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      const result = await notificationsService.broadcastPromotion(
        ['u1', 'u2'],
        'خصم كبير',
        'تفاصيل العرض'
      );

      expect(notificationsRepository.createMany).toHaveBeenCalledWith([
        { userId: 'u1', type: 'PROMOTION', title: 'خصم كبير', body: 'تفاصيل العرض' },
        { userId: 'u2', type: 'PROMOTION', title: 'خصم كبير', body: 'تفاصيل العرض' },
      ]);
      expect(result).toBe(2);
    });
  });

  describe('subscribeToPush', () => {
    const input = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    };

    it('upserts the subscription via the repository and resolves undefined', async () => {
      (notificationsRepository.upsertPushSubscription as jest.Mock).mockResolvedValue({
        id: 'sub-1',
      });

      await expect(notificationsService.subscribeToPush(userId, input)).resolves.toBeUndefined();
      expect(notificationsRepository.upsertPushSubscription).toHaveBeenCalledWith(userId, input);
    });
  });

  describe('unsubscribeFromPush', () => {
    it('deletes the subscription via the repository and resolves undefined regardless of row count', async () => {
      (notificationsRepository.deletePushSubscription as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(
        notificationsService.unsubscribeFromPush(userId, 'https://fcm.googleapis.com/fcm/send/abc123')
      ).resolves.toBeUndefined();
      expect(notificationsRepository.deletePushSubscription).toHaveBeenCalledWith(
        userId,
        'https://fcm.googleapis.com/fcm/send/abc123'
      );
    });
  });
});

describe('notificationEvents', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('onNewMessage', () => {
    it('creates a NEW_MESSAGE notification for the recipient with the conversationId in data', async () => {
      (notificationsRepository.create as jest.Mock).mockResolvedValue({ id: 'notif-1' });

      await notificationEvents.onNewMessage('recipient-1', 'conv-1', 'Sender Name');

      expect(notificationsRepository.create).toHaveBeenCalledWith({
        userId: 'recipient-1',
        type: 'NEW_MESSAGE',
        title: 'رسالة جديدة',
        body: 'Sender Name أرسل لك رسالة',
        data: { conversationId: 'conv-1' },
      });
    });

    it('also fires a push to the recipient with a link to the conversation', async () => {
      (notificationsRepository.create as jest.Mock).mockResolvedValue({ id: 'notif-1' });

      await notificationEvents.onNewMessage('recipient-1', 'conv-1', 'Sender Name');

      expect(pushService.notifyUser).toHaveBeenCalledWith('recipient-1', {
        title: 'رسالة جديدة',
        body: 'Sender Name أرسل لك رسالة',
        url: '/messages/conv-1',
        tag: 'conversation-conv-1',
      });
    });

    it('still creates the in-app notification even if the push send rejects', async () => {
      (notificationsRepository.create as jest.Mock).mockResolvedValue({ id: 'notif-1' });
      (pushService.notifyUser as jest.Mock).mockRejectedValueOnce(new Error('push failed'));

      await expect(
        notificationEvents.onNewMessage('recipient-1', 'conv-1', 'Sender Name')
      ).resolves.toEqual({ id: 'notif-1' });
    });
  });

  describe('onFavoritedAdPriceChanged', () => {
    it('returns { count: 0 } without calling the repository when there are no favoriters', async () => {
      const result = await notificationEvents.onFavoritedAdPriceChanged([], 'ad-1', 'Ad Title');

      expect(result).toEqual({ count: 0 });
      expect(notificationsRepository.createMany).not.toHaveBeenCalled();
      expect(pushService.notifyUsers).not.toHaveBeenCalled();
    });

    it('fans out a FAV_AD_PRICE_CHANGED notification to every favoriter with the adId in data', async () => {
      (notificationsRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      const result = await notificationEvents.onFavoritedAdPriceChanged(
        ['u1', 'u2'],
        'ad-1',
        'Ad Title'
      );

      expect(notificationsRepository.createMany).toHaveBeenCalledWith([
        {
          userId: 'u1',
          type: 'FAV_AD_PRICE_CHANGED',
          title: 'تغيّر سعر إعلان في المفضلة',
          body: 'تم تحديث سعر "Ad Title"',
          data: { adId: 'ad-1' },
        },
        {
          userId: 'u2',
          type: 'FAV_AD_PRICE_CHANGED',
          title: 'تغيّر سعر إعلان في المفضلة',
          body: 'تم تحديث سعر "Ad Title"',
          data: { adId: 'ad-1' },
        },
      ]);
      expect(result).toEqual({ count: 2 });
    });

    it('also fires a single fan-out push call to every favoriter', async () => {
      (notificationsRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      await notificationEvents.onFavoritedAdPriceChanged(['u1', 'u2'], 'ad-1', 'Ad Title');

      expect(pushService.notifyUsers).toHaveBeenCalledWith(['u1', 'u2'], {
        title: 'تغيّر سعر إعلان في المفضلة',
        body: 'تم تحديث سعر "Ad Title"',
        url: '/ads/ad-1',
        tag: 'ad-ad-1',
      });
    });
  });

  describe('onSavedSearchMatched', () => {
    it('returns { count: 0 } without calling the repository or push when there are no matches', async () => {
      const result = await notificationEvents.onSavedSearchMatched([], 'ad-1', 'Ad Title');

      expect(result).toEqual({ count: 0 });
      expect(notificationsRepository.createMany).not.toHaveBeenCalled();
      expect(pushService.notifyUser).not.toHaveBeenCalled();
    });

    it('fires one push per match, each tagged with its own savedSearchId', async () => {
      (notificationsRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      await notificationEvents.onSavedSearchMatched(
        [
          { userId: 'u1', savedSearchId: 'search-1', label: 'iPhone في دير البلح' },
          { userId: 'u2', savedSearchId: 'search-2', label: 'لابتوبات مستعملة' },
        ],
        'ad-1',
        'Ad Title'
      );

      expect(pushService.notifyUser).toHaveBeenCalledWith('u1', {
        title: 'إعلان جديد يطابق بحثك المحفوظ',
        body: '"Ad Title" يطابق بحثك المحفوظ "iPhone في دير البلح"',
        url: '/ads/ad-1',
        tag: 'saved-search-search-1',
      });
      expect(pushService.notifyUser).toHaveBeenCalledWith('u2', {
        title: 'إعلان جديد يطابق بحثك المحفوظ',
        body: '"Ad Title" يطابق بحثك المحفوظ "لابتوبات مستعملة"',
        url: '/ads/ad-1',
        tag: 'saved-search-search-2',
      });
    });
  });

  describe('onStoreNewProduct', () => {
    it('returns { count: 0 } without calling the repository or push when there are no followers', async () => {
      const result = await notificationEvents.onStoreNewProduct([], 'store-1', 'Store', 'Product');

      expect(result).toEqual({ count: 0 });
      expect(notificationsRepository.createMany).not.toHaveBeenCalled();
      expect(pushService.notifyUsers).not.toHaveBeenCalled();
    });

    it('fires a single fan-out push call to every follower', async () => {
      (notificationsRepository.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      await notificationEvents.onStoreNewProduct(['u1', 'u2'], 'store-1', 'متجري', 'منتج جديد');

      expect(pushService.notifyUsers).toHaveBeenCalledWith(['u1', 'u2'], {
        title: 'منتج جديد',
        body: 'متجر "متجري" أضاف منتجًا جديدًا: منتج جديد',
        url: '/stores/store-1',
        tag: 'store-store-1',
      });
    });
  });
});
