import { notificationsController } from '../../src/modules/notifications/notifications.controller';
import { notificationsService } from '../../src/modules/notifications/notifications.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/notifications/notifications.service');
jest.mock('../../src/shared/utils/requireUser');

describe('notificationsController — device list', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1' });
  });

  it('listDevices returns the caller\'s devices', async () => {
    (notificationsService.listDevices as jest.Mock).mockResolvedValue([{ id: 'w1' }]);
    const res = mockResponse();
    await notificationsController.listDevices(mockRequest({}), res, mockNext());
    expect(notificationsService.listDevices).toHaveBeenCalledWith('user-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [{ id: 'w1' }] }));
  });

  it('renameDevice trims and forwards the label', async () => {
    (notificationsService.renameDevice as jest.Mock).mockResolvedValue(undefined);
    const req = mockRequest({ params: { kind: 'web', id: 'w1' }, body: { label: '  هاتفي  ' } });
    const res = mockResponse();
    await notificationsController.renameDevice(req, res, mockNext());
    expect(notificationsService.renameDevice).toHaveBeenCalledWith('user-1', 'web', 'w1', 'هاتفي');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it.each([
    [{ kind: 'web', id: 'w1' }, { label: '   ' }],
    [{ kind: 'web', id: 'w1' }, { label: 'x'.repeat(61) }],
    [{ kind: 'desktop', id: 'w1' }, { label: 'ok' }],
  ])('renameDevice rejects invalid input (%j, %j)', async (params, body) => {
    const next = mockNext();
    await notificationsController.renameDevice(mockRequest({ params, body } as never), mockResponse(), next);
    expect(next).toHaveBeenCalledWith(expect.anything());
    expect(notificationsService.renameDevice).not.toHaveBeenCalled();
  });

  it('removeDevice forwards kind and id', async () => {
    (notificationsService.removeDevice as jest.Mock).mockResolvedValue(undefined);
    const res = mockResponse();
    await notificationsController.removeDevice(
      mockRequest({ params: { kind: 'native', id: 'n1' } }),
      res,
      mockNext()
    );
    expect(notificationsService.removeDevice).toHaveBeenCalledWith('user-1', 'native', 'n1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('removeDevice passes NotFoundError to next()', async () => {
    const err = new NotFoundError('Device not found', 'DEVICE_NOT_FOUND');
    (notificationsService.removeDevice as jest.Mock).mockRejectedValue(err);
    const next = mockNext();
    await notificationsController.removeDevice(
      mockRequest({ params: { kind: 'web', id: 'zzz' } }),
      mockResponse(),
      next
    );
    expect(next).toHaveBeenCalledWith(err);
  });
});
