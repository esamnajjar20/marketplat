import { notificationsService, notificationEvents } from '../../src/modules/notifications/notifications.service';
import { notificationsRepository } from '../../src/modules/notifications/notifications.repository';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';

jest.mock('../../src/modules/notifications/notifications.repository');

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
  });

  describe('onFavoritedAdPriceChanged', () => {
    it('returns { count: 0 } without calling the repository when there are no favoriters', async () => {
      const result = await notificationEvents.onFavoritedAdPriceChanged([], 'ad-1', 'Ad Title');

      expect(result).toEqual({ count: 0 });
      expect(notificationsRepository.createMany).not.toHaveBeenCalled();
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
  });
});
