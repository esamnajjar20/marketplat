import { activityController } from '../../src/modules/activity/activity.controller';
import { activityService } from '../../src/modules/activity/activity.service';
import { sellersService } from '../../src/modules/sellers/sellers.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/activity/activity.service');
jest.mock('../../src/modules/sellers/sellers.service');
jest.mock('../../src/shared/utils/requireUser');

describe('activityController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1', role: 'USER' });
  });

  it('getDashboardOverview batches recent activity and attention counters in parallel', async () => {
    (activityService.getMyActivity as jest.Mock).mockResolvedValue({ items: [{ id: 'a1' }], meta: { total: 1 } });
    (sellersService.getMyAttention as jest.Mock).mockResolvedValue({ adsMissingImages: 2, productsOutOfStock: 0, productsMissingImages: 0, pendingServiceRequests: 0, hasStore: false, isProvider: false });
    const res = mockResponse();
    await activityController.getDashboardOverview(mockRequest(), res, mockNext());
    expect(activityService.getMyActivity).toHaveBeenCalledWith('user-1', { limit: 8 });
    expect(sellersService.getMyAttention).toHaveBeenCalledWith('user-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: expect.objectContaining({ activity: expect.any(Object), attention: expect.any(Object), failures: { activity: false, attention: false } }) }));
  });

  it('keeps dashboard panels independent when one data source fails', async () => {
    (activityService.getMyActivity as jest.Mock).mockRejectedValue(new Error('activity unavailable'));
    (sellersService.getMyAttention as jest.Mock).mockResolvedValue({ adsMissingImages: 0, productsOutOfStock: 0, productsMissingImages: 0, pendingServiceRequests: 0, hasStore: false, isProvider: false });
    const res = mockResponse();
    await activityController.getDashboardOverview(mockRequest(), res, mockNext());
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ activity: null, failures: { activity: true, attention: false } }),
    }));
  });

  it('getMyActivity returns 200 with items and pagination meta', async () => {
    (activityService.getMyActivity as jest.Mock).mockResolvedValue({
      items: [{ id: 'a1' }],
      meta: { total: 1, page: 1, limit: 20 },
    });
    const res = mockResponse();
    await activityController.getMyActivity(mockRequest({ query: {} }), res, mockNext());

    expect(activityService.getMyActivity).toHaveBeenCalledWith('user-1', expect.any(Object));
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: [{ id: 'a1' }],
      }),
    );
  });

  it('forwards errors to next', async () => {
    (activityService.getMyActivity as jest.Mock).mockRejectedValue(new Error('db'));
    const next = mockNext();
    await activityController.getMyActivity(mockRequest({ query: {} }), mockResponse(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
