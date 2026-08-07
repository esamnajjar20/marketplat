/**
 * FIX PWA-PUSH-01: pushService.ts is the missing backend half of the
 * frontend's already-built push-subscription plumbing (see
 * frontend/lib/pwa.ts and frontend/public/sw.js). These tests mirror
 * emailService.test.ts's structure for the same reasons:
 *   1. The graceful-fallback path (VAPID unconfigured — must not throw,
 *      must not attempt a real network call).
 *   2. The real-send path (VAPID configured) — web-push is mocked at
 *      the module boundary, so no real push service is ever contacted.
 *   3. Per-subscription error handling — one subscription failing must
 *      never stop the others from sending, and must never propagate
 *      (fire-and-forget, same as email).
 *   4. Stale-subscription pruning — a 404/410 from the push service
 *      means the browser subscription is permanently gone and the row
 *      should be deleted, not retried.
 */

const mockSetVapidDetails = jest.fn();
const mockSendNotification = jest.fn();

jest.mock('web-push', () => ({
  setVapidDetails: (...args: unknown[]) => mockSetVapidDetails(...args),
  sendNotification: (...args: unknown[]) => mockSendNotification(...args),
}));

jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const mockFindManyByUserId = jest.fn();
const mockDeleteByEndpoints = jest.fn();

// AUDIT-FIX 2.6: pushService.ts now goes through
// shared/utils/pushSubscriptionsRepository.ts instead of calling
// prisma.pushSubscription directly (see that file's doc comment for
// why) — the mock boundary moves to match. mockFindManyByUserId takes
// only userId (not a Prisma where-clause) since that's this
// repository's actual signature.
jest.mock('../../src/shared/utils/pushSubscriptionsRepository', () => ({
  pushSubscriptionsRepository: {
    findManyByUserId: (...args: unknown[]) => mockFindManyByUserId(...args),
    deleteByEndpoints: (...args: unknown[]) => mockDeleteByEndpoints(...args),
  },
}));

const payload = { title: 'رسالة جديدة', body: 'شخص ما راسلك', url: '/messages/conv-1', tag: 'conversation-conv-1' };

describe('pushService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when VAPID is not configured (the default fallback)', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.doMock('../../src/config/env', () => ({
        env: { webPush: { isConfigured: false, publicKey: '', privateKey: '', subject: '' } },
      }));
    });

    it('notifyUser does not throw and does not call web-push or the database', async () => {
      const { pushService } = require('../../src/shared/utils/pushService');

      await expect(pushService.notifyUser('user-1', payload)).resolves.toBeUndefined();

      expect(mockSetVapidDetails).not.toHaveBeenCalled();
      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(mockFindManyByUserId).not.toHaveBeenCalled();
    });

    it('notifyUser logs a clearly-labeled fallback warning', async () => {
      const { pushService } = require('../../src/shared/utils/pushService');
      const { logger } = require('../../src/shared/utils/logger');

      await pushService.notifyUser('user-1', payload);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('PUSH NOT SENT'),
        expect.objectContaining({ userId: 'user-1', title: payload.title })
      );
    });

    it('notifyUsers also falls back to logging for every recipient without throwing', async () => {
      const { pushService } = require('../../src/shared/utils/pushService');

      await expect(pushService.notifyUsers(['u1', 'u2'], payload)).resolves.toBeUndefined();
      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it('notifyUsers resolves immediately with an empty userIds array', async () => {
      const { pushService } = require('../../src/shared/utils/pushService');

      await expect(pushService.notifyUsers([], payload)).resolves.toBeUndefined();
      expect(mockFindManyByUserId).not.toHaveBeenCalled();
    });
  });

  describe('when VAPID is configured', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.doMock('../../src/config/env', () => ({
        env: {
          webPush: {
            isConfigured: true,
            publicKey: 'public-key',
            privateKey: 'private-key',
            subject: 'mailto:admin@example.com',
          },
        },
      }));
    });

    it('sets VAPID details from env on first send', async () => {
      mockFindManyByUserId.mockResolvedValue([]);
      const { pushService } = require('../../src/shared/utils/pushService');

      await pushService.notifyUser('user-1', payload);

      expect(mockSetVapidDetails).toHaveBeenCalledWith(
        'mailto:admin@example.com',
        'public-key',
        'private-key'
      );
    });

    it('does nothing further when the user has no subscriptions', async () => {
      mockFindManyByUserId.mockResolvedValue([]);
      const { pushService } = require('../../src/shared/utils/pushService');

      await pushService.notifyUser('user-1', payload);

      expect(mockSendNotification).not.toHaveBeenCalled();
    });

    it('sends to every subscription row the user has, with keys mapped to web-push shape', async () => {
      mockFindManyByUserId.mockResolvedValue([
        { id: 'sub-1', userId: 'user-1', endpoint: 'https://push/1', p256dh: 'p1', auth: 'a1' },
        { id: 'sub-2', userId: 'user-1', endpoint: 'https://push/2', p256dh: 'p2', auth: 'a2' },
      ]);
      mockSendNotification.mockResolvedValue(undefined);
      const { pushService } = require('../../src/shared/utils/pushService');

      await pushService.notifyUser('user-1', payload);

      expect(mockSendNotification).toHaveBeenCalledTimes(2);
      expect(mockSendNotification).toHaveBeenCalledWith(
        { endpoint: 'https://push/1', keys: { p256dh: 'p1', auth: 'a1' } },
        JSON.stringify({ title: payload.title, body: payload.body, url: payload.url, tag: payload.tag })
      );
      expect(mockSendNotification).toHaveBeenCalledWith(
        { endpoint: 'https://push/2', keys: { p256dh: 'p2', auth: 'a2' } },
        JSON.stringify({ title: payload.title, body: payload.body, url: payload.url, tag: payload.tag })
      );
    });

    it('does not throw when a send fails with a non-Gone error, and logs it as a warning', async () => {
      mockFindManyByUserId.mockResolvedValue([
        { id: 'sub-1', userId: 'user-1', endpoint: 'https://push/1', p256dh: 'p1', auth: 'a1' },
      ]);
      mockSendNotification.mockRejectedValue(new Error('network blip'));
      const { pushService } = require('../../src/shared/utils/pushService');
      const { logger } = require('../../src/shared/utils/logger');

      await expect(pushService.notifyUser('user-1', payload)).resolves.toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        'Push send failed',
        expect.objectContaining({ userId: 'user-1', endpoint: 'https://push/1' })
      );
      expect(mockDeleteByEndpoints).not.toHaveBeenCalled();
    });

    it('one subscription failing does not stop the others from sending', async () => {
      mockFindManyByUserId.mockResolvedValue([
        { id: 'sub-1', userId: 'user-1', endpoint: 'https://push/1', p256dh: 'p1', auth: 'a1' },
        { id: 'sub-2', userId: 'user-1', endpoint: 'https://push/2', p256dh: 'p2', auth: 'a2' },
      ]);
      mockSendNotification
        .mockRejectedValueOnce(new Error('network blip'))
        .mockResolvedValueOnce(undefined);
      const { pushService } = require('../../src/shared/utils/pushService');

      await pushService.notifyUser('user-1', payload);

      expect(mockSendNotification).toHaveBeenCalledTimes(2);
    });

    it('prunes the subscription row when the push service returns 410 Gone', async () => {
      mockFindManyByUserId.mockResolvedValue([
        { id: 'sub-1', userId: 'user-1', endpoint: 'https://push/1', p256dh: 'p1', auth: 'a1' },
      ]);
      mockSendNotification.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
      mockDeleteByEndpoints.mockResolvedValue({ count: 1 });
      const { pushService } = require('../../src/shared/utils/pushService');
      const { logger } = require('../../src/shared/utils/logger');

      await pushService.notifyUser('user-1', payload);

      expect(mockDeleteByEndpoints).toHaveBeenCalledWith(['https://push/1']);
      // 410 is expected/routine — must not be logged as a warning like
      // an unexpected failure would be.
      expect(logger.warn).not.toHaveBeenCalledWith('Push send failed', expect.anything());
    });

    it('prunes the subscription row when the push service returns 404 Not Found', async () => {
      mockFindManyByUserId.mockResolvedValue([
        { id: 'sub-1', userId: 'user-1', endpoint: 'https://push/1', p256dh: 'p1', auth: 'a1' },
      ]);
      mockSendNotification.mockRejectedValue(
        Object.assign(new Error('Not Found'), { statusCode: 404 })
      );
      mockDeleteByEndpoints.mockResolvedValue({ count: 1 });
      const { pushService } = require('../../src/shared/utils/pushService');

      await pushService.notifyUser('user-1', payload);

      expect(mockDeleteByEndpoints).toHaveBeenCalledWith(['https://push/1']);
    });

    it('does not throw even if pruning the stale subscription itself fails', async () => {
      mockFindManyByUserId.mockResolvedValue([
        { id: 'sub-1', userId: 'user-1', endpoint: 'https://push/1', p256dh: 'p1', auth: 'a1' },
      ]);
      mockSendNotification.mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
      mockDeleteByEndpoints.mockRejectedValue(new Error('db unavailable'));
      const { pushService } = require('../../src/shared/utils/pushService');

      await expect(pushService.notifyUser('user-1', payload)).resolves.toBeUndefined();
    });

    it('notifyUsers sends to every given user independently', async () => {
      mockFindManyByUserId
        .mockResolvedValueOnce([
          { id: 'sub-1', userId: 'u1', endpoint: 'https://push/1', p256dh: 'p1', auth: 'a1' },
        ])
        .mockResolvedValueOnce([
          { id: 'sub-2', userId: 'u2', endpoint: 'https://push/2', p256dh: 'p2', auth: 'a2' },
        ]);
      mockSendNotification.mockResolvedValue(undefined);
      const { pushService } = require('../../src/shared/utils/pushService');

      await pushService.notifyUsers(['u1', 'u2'], payload);

      expect(mockFindManyByUserId).toHaveBeenCalledWith('u1');
      expect(mockFindManyByUserId).toHaveBeenCalledWith('u2');
      expect(mockSendNotification).toHaveBeenCalledTimes(2);
    });

    it('reuses VAPID configuration across multiple calls instead of re-setting it each time', async () => {
      mockFindManyByUserId.mockResolvedValue([]);
      const { pushService } = require('../../src/shared/utils/pushService');

      await pushService.notifyUser('u1', payload);
      await pushService.notifyUser('u2', payload);

      expect(mockSetVapidDetails).toHaveBeenCalledTimes(1);
    });
  });
});
