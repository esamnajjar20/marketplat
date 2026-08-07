/**
 * AUDIT-FIX 2.6: shared/utils/pushSubscriptionsRepository.ts centralizes
 * PushSubscription data access (previously duplicated between
 * pushService.ts and notifications.repository.ts, each calling
 * prisma.pushSubscription directly). These tests cover the ownership
 * and upsert-identity guarantees that used to live in
 * notifications.repository.test.ts, now that the actual prisma calls
 * live here.
 */
import { pushSubscriptionsRepository } from '../../src/shared/utils/pushSubscriptionsRepository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    pushSubscription: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const userId = 'user-1';

describe('pushSubscriptionsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findManyByUserId', () => {
    it('queries by userId', async () => {
      (prisma.pushSubscription.findMany as jest.Mock).mockResolvedValue([]);

      await pushSubscriptionsRepository.findManyByUserId(userId);

      expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith({ where: { userId } });
    });
  });

  describe('upsert', () => {
    const input = {
      userId,
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
      p256dh: 'p256dh-key',
      auth: 'auth-key',
    };

    it('upserts on endpoint, creating with userId and the given keys', async () => {
      (prisma.pushSubscription.upsert as jest.Mock).mockResolvedValue({ id: 'sub-1', ...input });

      await pushSubscriptionsRepository.upsert(input);

      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: { endpoint: input.endpoint },
        create: {
          userId: input.userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
        },
        update: {
          p256dh: input.p256dh,
          auth: input.auth,
        },
      });
    });

    it('does not include userId in the update branch (re-subscribe never reassigns owner)', async () => {
      (prisma.pushSubscription.upsert as jest.Mock).mockResolvedValue({});

      await pushSubscriptionsRepository.upsert(input);

      const call = (prisma.pushSubscription.upsert as jest.Mock).mock.calls[0][0];
      expect(call.update).not.toHaveProperty('userId');
    });
  });

  describe('deleteForUser', () => {
    it('scopes the delete to both userId and endpoint', async () => {
      (prisma.pushSubscription.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      const result = await pushSubscriptionsRepository.deleteForUser(
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

      const result = await pushSubscriptionsRepository.deleteForUser(userId, 'https://x/y');

      expect(result).toEqual({ count: 0 });
    });
  });

  describe('deleteByEndpoints', () => {
    it('deletes by a list of endpoints, not scoped to a single user', async () => {
      (prisma.pushSubscription.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });

      const result = await pushSubscriptionsRepository.deleteByEndpoints(['https://a', 'https://b']);

      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { endpoint: { in: ['https://a', 'https://b'] } },
      });
      expect(result).toEqual({ count: 2 });
    });
  });
});
