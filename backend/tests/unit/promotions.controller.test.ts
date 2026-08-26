import { promotionsController } from '../../src/modules/promotions/promotions.controller';
import { promotionsService } from '../../src/modules/promotions/promotions.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/promotions/promotions.service');
jest.mock('../../src/shared/utils/requireUser');

const userId = 'user-1';

describe('promotionsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId, role: 'USER' });
  });

  it('createPromotion returns 201', async () => {
    const promo = { id: 'promo-1', title: 'خصم' };
    (promotionsService.createPromotion as jest.Mock).mockResolvedValue(promo);
    const res = mockResponse();
    await promotionsController.createPromotion(
      mockRequest({
        body: {
          productId: 'prod-1',
          title: 'خصم 10%',
          discountType: 'PERCENTAGE',
          discountValue: 10,
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 86400000).toISOString(),
        },
      }),
      res,
      mockNext(),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(promotionsService.createPromotion).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ productId: 'prod-1' }),
    );
  });

  it('getMyPromotions returns 200', async () => {
    (promotionsService.getStorePromotions as jest.Mock).mockResolvedValue([]);
    const res = mockResponse();
    await promotionsController.getMyPromotions(mockRequest(), res, mockNext());
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getPromotionById returns 200', async () => {
    (promotionsService.getPromotionById as jest.Mock).mockResolvedValue({ id: 'p1' });
    const res = mockResponse();
    await promotionsController.getPromotionById(
      mockRequest({ params: { id: 'p1' } }),
      res,
      mockNext(),
    );
    expect(promotionsService.getPromotionById).toHaveBeenCalledWith(userId, 'p1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('updatePromotion returns 200', async () => {
    (promotionsService.updatePromotion as jest.Mock).mockResolvedValue({ id: 'p1' });
    const res = mockResponse();
    await promotionsController.updatePromotion(
      mockRequest({ params: { id: 'p1' }, body: { title: 'جديد' } }),
      res,
      mockNext(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('cancelPromotion returns 200', async () => {
    (promotionsService.cancelPromotion as jest.Mock).mockResolvedValue(undefined);
    const res = mockResponse();
    await promotionsController.cancelPromotion(
      mockRequest({ params: { id: 'p1' } }),
      res,
      mockNext(),
    );
    expect(promotionsService.cancelPromotion).toHaveBeenCalledWith(userId, 'p1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('forwards service errors to next', async () => {
    (promotionsService.getStorePromotions as jest.Mock).mockRejectedValue(new Error('x'));
    const next = mockNext();
    await promotionsController.getMyPromotions(mockRequest(), mockResponse(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
