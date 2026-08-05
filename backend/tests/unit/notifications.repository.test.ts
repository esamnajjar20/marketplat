import { notificationsRepository } from '../../src/modules/notifications/notifications.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    notification: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    pushSubscription: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const userId = 'user-1';

describe('notificationsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates a notification with the given input', async () => {
      const input = {
        userId,
        type: 'NEW_MESSAGE' as const,
        title: 'رسالة جديدة',
        body: 'شخص ما أرسل لك رسالة',
        data: { conversationId: 'conv-1' },
      };
      (prisma.notification.create as jest.Mock).mockResolvedValue({ id: 'notif-1', ...input });

      await notificationsRepository.create(input);

      expect(prisma.notification.create).toHaveBeenCalledWith({ data: input });
    });

    it('creates a notification with no data payload', async () => {
      const input = { userId, type: 'PROMOTION' as const, title: 'عرض', body: 'خصم 20%' };
      (prisma.notification.create as jest.Mock).mockResolvedValue({ id: 'notif-1', ...input });

      await notificationsRepository.create(input);

      expect(prisma.notification.create).toHaveBeenCalledWith({ data: input });
    });
  });

  describe('createMany', () => {
    it('fans out a createMany call with every input row', async () => {
      const inputs = [
        { userId: 'u1', type: 'PROMOTION' as const, title: 'عرض', body: 'خصم' },
        { userId: 'u2', type: 'PROMOTION' as const, title: 'عرض', body: 'خصم' },
      ];
      (prisma.notification.createMany as jest.Mock).mockResolvedValue({ count: 2 });

      const result = await notificationsRepository.createMany(inputs);

      expect(prisma.notification.createMany).toHaveBeenCalledWith({ data: inputs });
      expect(result).toEqual({ count: 2 });
    });
  });

  describe('findManyForUser', () => {
    it('applies default page/limit and no readAt filter when the query is empty', async () => {
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.notification.count as jest.Mock).mockResolvedValue(0);

      await notificationsRepository.findManyForUser(userId, {});

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.notification.count).toHaveBeenCalledWith({ where: { userId } });
    });

    it('adds a readAt: null filter when unreadOnly is true', async () => {
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.notification.count as jest.Mock).mockResolvedValue(0);

      await notificationsRepository.findManyForUser(userId, { unreadOnly: true });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId, readAt: null } })
      );
    });

    it('applies pagination skip/take from page and limit', async () => {
      (prisma.notification.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.notification.count as jest.Mock).mockResolvedValue(0);

      await notificationsRepository.findManyForUser(userId, { page: 2, limit: 10 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      );
    });

    it('returns the notifications and total from the parallel queries', async () => {
      const notifications = [{ id: 'notif-1' }, { id: 'notif-2' }];
      (prisma.notification.findMany as jest.Mock).mockResolvedValue(notifications);
      (prisma.notification.count as jest.Mock).mockResolvedValue(2);

      const result = await notificationsRepository.findManyForUser(userId, {});

      expect(result).toEqual({ notifications, total: 2 });
    });
  });

  describe('countUnreadForUser', () => {
    it('counts notifications with readAt null for the given user', async () => {
      (prisma.notification.count as jest.Mock).mockResolvedValue(5);

      const result = await notificationsRepository.countUnreadForUser(userId);

      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: { userId, readAt: null },
      });
      expect(result).toBe(5);
    });
  });

  describe('markRead', () => {
    it('scopes the update to the given id AND userId, only if currently unread', async () => {
      (prisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await notificationsRepository.markRead('notif-1', userId);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { id: 'notif-1', userId, readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(result).toEqual({ count: 1 });
    });

    it('returns count 0 when the notification does not belong to the caller', async () => {
      (prisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const result = await notificationsRepository.markRead('notif-1', 'someone-else');

      expect(result).toEqual({ count: 0 });
    });
  });

  describe('markAllRead', () => {
    it('marks every unread notification for the user as read', async () => {
      (prisma.notification.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

      const result = await notificationsRepository.markAllRead(userId);

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: { userId, readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(result).toEqual({ count: 3 });
    });
  });

  describe('upsertPushSubscription', () => {
    const input = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    };

    it('upserts on endpoint, creating with userId and the given keys', async () => {
      (prisma.pushSubscription.upsert as jest.Mock).mockResolvedValue({
        id: 'sub-1',
        userId,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      });

      await notificationsRepository.upsertPushSubscription(userId, input);

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
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
      });
    });

    it('does not include userId in the update branch (re-subscribe never reassigns owner)', async () => {
      (prisma.pushSubscription.upsert as jest.Mock).mockResolvedValue({});

      await notificationsRepository.upsertPushSubscription(userId, input);

      const call = (prisma.pushSubscription.upsert as jest.Mock).mock.calls[0][0];
      expect(call.update).not.toHaveProperty('userId');
    });
  });

  describe('deletePushSubscription', () => {
    it('scopes the delete to both userId and endpoint', async () => {
      (prisma.pushSubscription.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await notificationsRepository.deletePushSubscription(
        userId,
        'https://fcm.googleapis.com/fcm/send/abc123'
      );

      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { userId, endpoint: 'https://fcm.googleapis.com/fcm/send/abc123' },
      });
      expect(result).toEqual({ count: 1 });
    });

    it('returns count 0 when no matching subscription exists (not treated as an error)', async () => {
      (prisma.pushSubscription.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      const result = await notificationsRepository.deletePushSubscription(userId, 'https://x/y');

      expect(result).toEqual({ count: 0 });
    });
  });
});
