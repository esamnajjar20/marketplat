import { notificationsService, notificationEvents } from '../../src/modules/notifications/notifications.service';
import { notificationsRepository } from '../../src/modules/notifications/notifications.repository';
import { pushService } from '../../src/shared/utils/pushService';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { prisma } from '../../src/config/prisma';

import { pushSubscriptionsRepository } from '../../src/shared/utils/pushSubscriptionsRepository';
import { fcmDeviceTokensRepository } from '../../src/shared/utils/fcmDeviceTokensRepository';

jest.mock('../../src/modules/notifications/notifications.repository');
jest.mock('../../src/shared/utils/pushSubscriptionsRepository');
jest.mock('../../src/shared/utils/fcmDeviceTokensRepository');
jest.mock('../../src/shared/utils/pushService', () => ({
  pushService: {
    notifyUser: jest.fn().mockResolvedValue(undefined),
    notifyUsers: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../src/config/prisma', () => ({
  prisma: {
    user: { findMany: jest.fn(), findUnique: jest.fn() },
    notification: { groupBy: jest.fn(), count: jest.fn() },
  },
}));
jest.mock('../../src/shared/utils/notificationStream', () => ({
  publishNotificationEvent: jest.fn().mockResolvedValue(undefined),
  publishNotificationEventToMany: jest.fn().mockResolvedValue(undefined),
  addNotificationStreamClient: jest.fn(),
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
      // promotions defaults to OFF (see DEFAULT_PREFS.promotions in
      // notifications.service.ts) — must be explicitly true here, or
      // filterUserIdsByPref filters both users out and createMany
      // never gets called.
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'u1', notificationPreferences: { promotions: true } },
        { id: 'u2', notificationPreferences: { promotions: true } },
      ]);
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

    it('sends the push AFTER the in-app rows are written, one slice at a time', async () => {
      const order: string[] = [];
      (prisma.user.findMany as jest.Mock).mockImplementation(
        async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.map((id: string) => ({ id, notificationPreferences: { promotions: true } }))
      );
      (notificationsRepository.createMany as jest.Mock).mockImplementation(async (rows: unknown[]) => {
        order.push(`createMany:${rows.length}`);
        return { count: rows.length };
      });
      (pushService.notifyUsers as jest.Mock).mockImplementation(async (ids: string[]) => {
        order.push(`push:${ids.length}`);
      });

      const ids = Array.from({ length: 600 }, (_, i) => `u${i}`);
      const total = await notificationsService.broadcastPromotion(ids, 'عنوان', 'نص');
      await new Promise((r) => setImmediate(r)); // let the un-awaited push chain drain

      expect(total).toBe(600);
      const at = (e: string) => order.indexOf(e);
      // each slice's push comes after that slice's rows...
      expect(at('push:500')).toBeGreaterThan(at('createMany:500'));
      expect(at('push:100')).toBeGreaterThan(at('createMany:100'));
      // ...and slice pushes never overlap/reorder (serialized chain)
      expect(at('push:100')).toBeGreaterThan(at('push:500'));
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
      expect(notificationsRepository.upsertPushSubscription).toHaveBeenCalledWith(userId, input, null);
    });

    it('derives a default device label from the User-Agent', async () => {
      (notificationsRepository.upsertPushSubscription as jest.Mock).mockResolvedValue({ id: 'sub-1' });
      const ua =
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

      await notificationsService.subscribeToPush(userId, input, ua);

      expect(notificationsRepository.upsertPushSubscription).toHaveBeenCalledWith(
        userId,
        input,
        'Chrome · Android'
      );
    });
  });

  describe('device list', () => {
    const t1 = new Date('2026-10-01T10:00:00Z');
    const t2 = new Date('2026-10-02T10:00:00Z');

    it('merges browser and native registrations, newest activity first, without exposing credentials', async () => {
      (pushSubscriptionsRepository.listForUser as jest.Mock).mockResolvedValue([
        { id: 'w1', endpoint: 'https://push.example/secret-endpoint', label: 'Chrome · Android', createdAt: t1, lastSeenAt: t1 },
      ]);
      (fcmDeviceTokensRepository.listForUser as jest.Mock).mockResolvedValue([
        { id: 'n1', token: 'secret-fcm-token', platform: 'android', label: null, createdAt: t1, lastSeenAt: t2 },
      ]);

      const devices = await notificationsService.listDevices(userId);

      expect(devices.map((d) => d.id)).toEqual(['n1', 'w1']);
      expect(devices[0]).toMatchObject({ kind: 'native', platform: 'android', label: null });
      expect(devices[1]).toMatchObject({ kind: 'web', platform: null, label: 'Chrome · Android' });
      for (const d of devices) {
        expect(d.fingerprint).toMatch(/^[0-9a-f]{16}$/);
        expect(JSON.stringify(d)).not.toContain('secret');
      }
    });

    it('renames a web device scoped to the caller', async () => {
      (pushSubscriptionsRepository.renameForUser as jest.Mock).mockResolvedValue({ count: 1 });
      await expect(
        notificationsService.renameDevice(userId, 'web', 'w1', 'هاتفي')
      ).resolves.toBeUndefined();
      expect(pushSubscriptionsRepository.renameForUser).toHaveBeenCalledWith(userId, 'w1', 'هاتفي');
    });

    it('rename/remove throw NotFoundError when the id is not the caller\'s', async () => {
      (fcmDeviceTokensRepository.renameForUser as jest.Mock).mockResolvedValue({ count: 0 });
      (fcmDeviceTokensRepository.deleteByIdForUser as jest.Mock).mockResolvedValue({ count: 0 });
      await expect(notificationsService.renameDevice(userId, 'native', 'x', 'a')).rejects.toThrow(NotFoundError);
      await expect(notificationsService.removeDevice(userId, 'native', 'x')).rejects.toThrow(NotFoundError);
    });

    it('removes a device by id', async () => {
      (pushSubscriptionsRepository.deleteByIdForUser as jest.Mock).mockResolvedValue({ count: 1 });
      await expect(notificationsService.removeDevice(userId, 'web', 'w1')).resolves.toBeUndefined();
      expect(pushSubscriptionsRepository.deleteByIdForUser).toHaveBeenCalledWith(userId, 'w1');
    });
  });

  describe('deleteNotification', () => {
    it('resolves when one row is deleted', async () => {
      (notificationsRepository.deleteForUser as jest.Mock).mockResolvedValue({ count: 1 });
      await expect(notificationsService.deleteNotification(userId, 'n1')).resolves.toBeUndefined();
    });
    it('throws NotFoundError when zero rows deleted', async () => {
      (notificationsRepository.deleteForUser as jest.Mock).mockResolvedValue({ count: 0 });
      await expect(notificationsService.deleteNotification(userId, 'n1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteAllRead', () => {
    it('returns the deleted count', async () => {
      (notificationsRepository.deleteAllReadForUser as jest.Mock).mockResolvedValue({ count: 4 });
      await expect(notificationsService.deleteAllRead(userId)).resolves.toBe(4);
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
  beforeEach(() => {
    jest.clearAllMocks();
    // onNewMessage reads prefs via the single-user hot path (findUnique),
    // not findMany — this describe previously only mocked findMany, so
    // userAllowsPref saw `undefined` and returned false (no row, no push).
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ notificationPreferences: {} });
    // Empty prefs blob → service defaults (all critical channels on).
    (prisma.user.findMany as jest.Mock).mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      (where.id.in ?? []).map((id: string) => ({ id, notificationPreferences: {} })),
    );
  });

  describe('onNewMessage', () => {
    it('creates/refreshes a NEW_MESSAGE notification for the recipient', async () => {
      (notificationsRepository.createOrRefreshNewMessage as jest.Mock).mockResolvedValue({ id: 'notif-1' });

      await notificationEvents.onNewMessage('recipient-1', 'conv-1', 'Sender Name');

      expect(notificationsRepository.createOrRefreshNewMessage).toHaveBeenCalledWith({
        userId: 'recipient-1',
        conversationId: 'conv-1',
        title: 'رسالة جديدة',
        body: 'Sender Name أرسل لك رسالة',
      });
    });

    it('also fires a push to the recipient with a link to the conversation', async () => {
      (notificationsRepository.createOrRefreshNewMessage as jest.Mock).mockResolvedValue({ id: 'notif-1' });

      await notificationEvents.onNewMessage('recipient-1', 'conv-1', 'Sender Name');

      expect(pushService.notifyUser).toHaveBeenCalledWith('recipient-1', {
        title: 'رسالة جديدة',
        body: 'Sender Name أرسل لك رسالة',
        url: '/messages/conv-1',
        tag: 'conversation-conv-1',
        urgent: true,
        type: 'NEW_MESSAGE',
      });
    });

    it('groups the push copy once several unread messages share a conversation', async () => {
      (notificationsRepository.createOrRefreshNewMessage as jest.Mock).mockResolvedValue({
        id: 'notif-1',
        data: { conversationId: 'conv-1', count: 3 },
      });

      await notificationEvents.onNewMessage('recipient-1', 'conv-1', 'أحمد');

      expect(pushService.notifyUser).toHaveBeenCalledWith('recipient-1', {
        title: '3 رسائل جديدة',
        body: '3 رسائل من أحمد',
        url: '/messages/conv-1',
        tag: 'conversation-conv-1',
        urgent: true,
        type: 'NEW_MESSAGE',
      });
    });

    it('does not push when the in-app row could not be written', async () => {
      (notificationsRepository.createOrRefreshNewMessage as jest.Mock).mockRejectedValueOnce(
        new Error('db down')
      );

      await expect(
        notificationEvents.onNewMessage('recipient-1', 'conv-1', 'Sender Name')
      ).rejects.toThrow('db down');
      expect(pushService.notifyUser).not.toHaveBeenCalled();
    });

    it('still creates the in-app notification even if the push send rejects', async () => {
      (notificationsRepository.createOrRefreshNewMessage as jest.Mock).mockResolvedValue({ id: 'notif-1' });
      (pushService.notifyUser as jest.Mock).mockRejectedValueOnce(new Error('push failed'));

      await expect(
        notificationEvents.onNewMessage('recipient-1', 'conv-1', 'Sender Name')
      ).resolves.toEqual({ id: 'notif-1' });
    });

    it('skips create and push when the recipient disabled newMessage', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        notificationPreferences: { newMessage: false },
      });

      const result = await notificationEvents.onNewMessage('recipient-1', 'conv-1', 'Sender Name');

      expect(result).toBeNull();
      expect(notificationsRepository.createOrRefreshNewMessage).not.toHaveBeenCalled();
      expect(pushService.notifyUser).not.toHaveBeenCalled();
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
        type: 'FAV_AD_PRICE_CHANGED',
      });
    });
  });

  describe('onSavedSearchMatched', () => {
    it('returns { count: 0 } without calling the repository or push when there are no matches', async () => {
      const result = await notificationEvents.onSavedSearchMatched([], {
        type: 'ad',
        id: 'ad-1',
        title: 'Ad Title',
      });

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
        { type: 'ad', id: 'ad-1', title: 'Ad Title' }
      );

      expect(pushService.notifyUser).toHaveBeenCalledWith('u1', {
        title: 'إعلان جديد يطابق بحثك المحفوظ',
        body: '"Ad Title" يطابق بحثك المحفوظ "iPhone في دير البلح"',
        url: '/ads/ad-1',
        tag: 'saved-search-search-1',
        type: 'SAVED_SEARCH_MATCH',
      });
      expect(pushService.notifyUser).toHaveBeenCalledWith('u2', {
        title: 'إعلان جديد يطابق بحثك المحفوظ',
        body: '"Ad Title" يطابق بحثك المحفوظ "لابتوبات مستعملة"',
        url: '/ads/ad-1',
        tag: 'saved-search-search-2',
        type: 'SAVED_SEARCH_MATCH',
      });
    });

    // PLATFORM-WIDE-01
    it('builds the product link/wording for a matched product', async () => {
      (notificationsRepository.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      await notificationEvents.onSavedSearchMatched(
        [{ userId: 'u1', savedSearchId: 'search-1', label: 'Phone cases' }],
        { type: 'product', id: 'product-1', title: 'iPhone case' }
      );

      expect(pushService.notifyUser).toHaveBeenCalledWith('u1', {
        title: 'منتج جديد يطابق بحثك المحفوظ',
        body: '"iPhone case" يطابق بحثك المحفوظ "Phone cases"',
        url: '/products/product-1',
        tag: 'saved-search-search-1',
        type: 'SAVED_SEARCH_MATCH',
      });
      expect(notificationsRepository.createMany).toHaveBeenCalledWith([
        expect.objectContaining({ data: { productId: 'product-1', savedSearchId: 'search-1' } }),
      ]);
    });

    // PLATFORM-WIDE-01
    it('builds the service link/wording for a matched service listing', async () => {
      (notificationsRepository.createMany as jest.Mock).mockResolvedValue({ count: 1 });

      await notificationEvents.onSavedSearchMatched(
        [{ userId: 'u1', savedSearchId: 'search-1', label: 'AC repair' }],
        { type: 'service', id: 'listing-1', title: 'Home AC repair' }
      );

      expect(pushService.notifyUser).toHaveBeenCalledWith('u1', {
        title: 'خدمة جديدة تطابق بحثك المحفوظ',
        body: '"Home AC repair" يطابق بحثك المحفوظ "AC repair"',
        url: '/services/listing-1',
        tag: 'saved-search-search-1',
        type: 'SAVED_SEARCH_MATCH',
      });
      expect(notificationsRepository.createMany).toHaveBeenCalledWith([
        expect.objectContaining({ data: { listingId: 'listing-1', savedSearchId: 'search-1' } }),
      ]);
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
        type: 'STORE_NEW_PRODUCT',
      });
    });
  });
});

describe('notificationEvents — service requests & appointments', () => {
  const findUnique = () => prisma.user.findUnique as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // One mock serves both the preference lookup and the name lookup.
    findUnique().mockResolvedValue({ notificationPreferences: {}, name: 'سارة' });
    (notificationsRepository.create as jest.Mock).mockImplementation(async (input) => ({ id: 'n-1', ...input }));
  });

  describe('onServiceRequestCreated', () => {
    it('creates SERVICE_REQUEST_NEW for the provider with the customer name and a request link', async () => {
      await notificationEvents.onServiceRequestCreated('provider-1', 'req-1', 'سباكة', 'customer-1');

      expect(notificationsRepository.create).toHaveBeenCalledWith({
        userId: 'provider-1',
        type: 'SERVICE_REQUEST_NEW',
        title: 'طلب خدمة جديد',
        body: 'سارة أرسل طلبًا على "سباكة"',
        data: { requestId: 'req-1' },
      });
      expect(pushService.notifyUser).toHaveBeenCalledWith(
        'provider-1',
        expect.objectContaining({ url: '/service-requests/req-1' })
      );
    });

    it('skips everything when the provider turned serviceQuotes off', async () => {
      findUnique().mockResolvedValue({ notificationPreferences: { serviceQuotes: false }, name: 'سارة' });

      const result = await notificationEvents.onServiceRequestCreated('provider-1', 'req-1', 'سباكة', 'customer-1');

      expect(result).toBeNull();
      expect(notificationsRepository.create).not.toHaveBeenCalled();
      expect(pushService.notifyUser).not.toHaveBeenCalled();
    });
  });

  describe('onServiceRequestStatusChanged', () => {
    it.each(['ACCEPTED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'])(
      'notifies the customer on %s and carries the status in data',
      async (status) => {
        await notificationEvents.onServiceRequestStatusChanged('customer-1', 'customer', 'req-1', 'سباكة', status);

        expect(notificationsRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'customer-1',
            type: 'SERVICE_REQUEST_UPDATE',
            data: { requestId: 'req-1', status },
          })
        );
      }
    );

    it('tells the provider when the customer cancels, with provider-side wording', async () => {
      await notificationEvents.onServiceRequestStatusChanged('provider-1', 'provider', 'req-1', 'سباكة', 'CANCELLED');

      expect(notificationsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ body: 'ألغى العميل طلبه على "سباكة"' })
      );
    });

    it('sends nothing for a status the recipient has no copy for (e.g. provider + ACCEPTED)', async () => {
      const result = await notificationEvents.onServiceRequestStatusChanged(
        'provider-1',
        'provider',
        'req-1',
        'سباكة',
        'ACCEPTED'
      );

      expect(result).toBeNull();
      expect(notificationsRepository.create).not.toHaveBeenCalled();
    });

    it('respects the serviceQuotes preference', async () => {
      findUnique().mockResolvedValue({ notificationPreferences: { serviceQuotes: false } });

      const result = await notificationEvents.onServiceRequestStatusChanged(
        'customer-1',
        'customer',
        'req-1',
        'سباكة',
        'COMPLETED'
      );

      expect(result).toBeNull();
      expect(notificationsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('onAppointmentChanged', () => {
    const start = new Date('2026-10-05T10:00:00.000Z');

    it('creates APPOINTMENT_UPDATE for a booking and links to the request', async () => {
      await notificationEvents.onAppointmentChanged('customer-1', 'req-1', 'سباكة', 'booked', start);

      expect(notificationsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'customer-1',
          type: 'APPOINTMENT_UPDATE',
          title: 'تم حجز موعد',
          data: { requestId: 'req-1' },
        })
      );
      expect(pushService.notifyUser).toHaveBeenCalledWith(
        'customer-1',
        expect.objectContaining({ url: '/service-requests/req-1' })
      );
    });

    it('uses cancellation wording for a cancelled appointment', async () => {
      await notificationEvents.onAppointmentChanged('customer-1', 'req-1', 'سباكة', 'cancelled', start);

      expect(notificationsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'تم إلغاء الموعد' })
      );
    });
  });

  describe('getMyNotifications category "services"', () => {
    it('includes the three new types so the UI filter shows them', async () => {
      (notificationsRepository.findManyForUser as jest.Mock).mockResolvedValue({ notifications: [], total: 0 });

      await notificationsService.getMyNotifications('user-1', { category: 'services' });

      const types = (notificationsRepository.findManyForUser as jest.Mock).mock.calls[0][1].types as string[];
      expect(types).toEqual(
        expect.arrayContaining(['SERVICE_REQUEST_NEW', 'SERVICE_REQUEST_UPDATE', 'APPOINTMENT_UPDATE'])
      );
    });
  });
});
