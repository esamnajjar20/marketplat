import { notificationsController } from '../../src/modules/notifications/notifications.controller';
import { notificationsService } from '../../src/modules/notifications/notifications.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/notifications/notifications.service');
jest.mock('../../src/shared/utils/requireUser');

const mockNotification = { id: 'notif-1', type: 'NEW_MESSAGE', title: 'رسالة جديدة' } as any;

describe('notificationsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1' });
  });

  describe('getMyNotifications', () => {
    it('returns 200 with items and pagination meta on success', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (notificationsService.getMyNotifications as jest.Mock).mockResolvedValue({
        items: [mockNotification],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });

      await notificationsController.getMyNotifications(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: [mockNotification],
          meta: expect.objectContaining({ pagination: expect.objectContaining({ total: 1 }) }),
        })
      );
    });

    it('calls next(error) when the caller is unauthenticated', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await notificationsController.getMyNotifications(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when query params fail validation', async () => {
      const req = mockRequest({ query: { limit: '999' } });
      const res = mockResponse();
      const next = mockNext();

      await notificationsController.getMyNotifications(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(notificationsService.getMyNotifications).not.toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('returns 200 with the count on success', async () => {
      const req = mockRequest({});
      const res = mockResponse();
      const next = mockNext();
      (notificationsService.getUnreadCount as jest.Mock).mockResolvedValue(5);

      await notificationsController.getUnreadCount(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: { count: 5 } })
      );
    });

    it('calls next(error) when the caller is unauthenticated', async () => {
      const req = mockRequest({});
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await notificationsController.getUnreadCount(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('markRead', () => {
    it('returns 200 on success', async () => {
      const req = mockRequest({ params: { id: 'notif-1' } });
      const res = mockResponse();
      const next = mockNext();
      (notificationsService.markRead as jest.Mock).mockResolvedValue(undefined);

      await notificationsController.markRead(req, res, next);

      expect(notificationsService.markRead).toHaveBeenCalledWith('user-1', 'notif-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('calls next(error) when the id param is missing', async () => {
      const req = mockRequest({ params: {} });
      const res = mockResponse();
      const next = mockNext();

      await notificationsController.markRead(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(notificationsService.markRead).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'notif-1' } });
      const res = mockResponse();
      const next = mockNext();
      (notificationsService.markRead as jest.Mock).mockRejectedValue(
        new NotFoundError('Notification not found')
      );

      await notificationsController.markRead(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('markAllRead', () => {
    it('returns 200 with the count of notifications marked read', async () => {
      const req = mockRequest({});
      const res = mockResponse();
      const next = mockNext();
      (notificationsService.markAllRead as jest.Mock).mockResolvedValue(3);

      await notificationsController.markAllRead(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: { count: 3 } })
      );
    });

    it('calls next(error) when the caller is unauthenticated', async () => {
      const req = mockRequest({});
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await notificationsController.markAllRead(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });
});
