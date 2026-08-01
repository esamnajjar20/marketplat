import { adminController } from '../../src/modules/admin/admin.controller';
import { adminService } from '../../src/modules/admin/admin.service';
import { notificationsService } from '../../src/modules/notifications';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

/**
 * Separate file from admin.controller.test.ts so this can mock
 * notificationsService without touching that file's existing
 * jest.mock('../../src/modules/admin/admin.service') setup — this
 * action is the only one in the controller that reaches outside the
 * admin module.
 */
jest.mock('../../src/modules/admin/admin.service');
jest.mock('../../src/modules/notifications', () => ({
  notificationsService: { broadcastPromotion: jest.fn() },
}));

describe('adminController.broadcastNotification', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sends to the given userIds and returns the recipient count', async () => {
    const req = mockRequest({
      body: { userIds: ['u1', 'u2'], title: 'عرض خاص', body: 'خصم اليوم' },
    });
    const res = mockResponse();
    const next = mockNext();
    (notificationsService.broadcastPromotion as jest.Mock).mockResolvedValue(2);

    await adminController.broadcastNotification(req, res, next);

    expect(notificationsService.broadcastPromotion).toHaveBeenCalledWith(
      ['u1', 'u2'],
      'عرض خاص',
      'خصم اليوم'
    );
    expect(adminService.getAllActiveUserIds).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { recipientCount: 2 } })
    );
  });

  it('resolves to every active user id first when allUsers is true, ignoring the given userIds', async () => {
    const req = mockRequest({
      body: { userIds: ['placeholder'], allUsers: true, title: 'عرض', body: 'نص' },
    });
    const res = mockResponse();
    const next = mockNext();
    (adminService.getAllActiveUserIds as jest.Mock).mockResolvedValue(['u1', 'u2', 'u3']);
    (notificationsService.broadcastPromotion as jest.Mock).mockResolvedValue(3);

    await adminController.broadcastNotification(req, res, next);

    expect(adminService.getAllActiveUserIds).toHaveBeenCalled();
    expect(notificationsService.broadcastPromotion).toHaveBeenCalledWith(
      ['u1', 'u2', 'u3'],
      'عرض',
      'نص'
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { recipientCount: 3 } })
    );
  });

  it('calls next(error) when userIds is empty and allUsers is not set', async () => {
    const req = mockRequest({ body: { userIds: [], title: 'عرض', body: 'نص' } });
    const res = mockResponse();
    const next = mockNext();

    await adminController.broadcastNotification(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(notificationsService.broadcastPromotion).not.toHaveBeenCalled();
  });

  it('calls next(error) when title is missing', async () => {
    const req = mockRequest({ body: { userIds: ['u1'], body: 'نص' } });
    const res = mockResponse();
    const next = mockNext();

    await adminController.broadcastNotification(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(notificationsService.broadcastPromotion).not.toHaveBeenCalled();
  });

  it('calls next(error) when the service throws', async () => {
    const req = mockRequest({ body: { userIds: ['u1'], title: 'عرض', body: 'نص' } });
    const res = mockResponse();
    const next = mockNext();
    (notificationsService.broadcastPromotion as jest.Mock).mockRejectedValue(new Error('db down'));

    await adminController.broadcastNotification(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
