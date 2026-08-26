import { badgesController } from '../../src/modules/badges/badges.controller';
import { badgesService } from '../../src/modules/badges/badges.service';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/badges/badges.service');

describe('badgesController', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getStoreBadges', () => {
    it('returns 200 with badges', async () => {
      const badges = [{ type: 'VERIFIED', label: 'موثّق' }];
      (badgesService.getStoreBadges as jest.Mock).mockResolvedValue(badges);
      const req = mockRequest({ params: { storeId: 'store-1' } });
      const res = mockResponse();
      const next = mockNext();

      await badgesController.getStoreBadges(req, res, next);

      expect(badgesService.getStoreBadges).toHaveBeenCalledWith('store-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: badges }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('forwards errors to next', async () => {
      (badgesService.getStoreBadges as jest.Mock).mockRejectedValue(new Error('boom'));
      const next = mockNext();
      await badgesController.getStoreBadges(
        mockRequest({ params: { storeId: 's1' } }),
        mockResponse(),
        next,
      );
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getProviderBadges', () => {
    it('returns 200 with badges', async () => {
      (badgesService.getProviderBadges as jest.Mock).mockResolvedValue([]);
      const res = mockResponse();
      await badgesController.getProviderBadges(
        mockRequest({ params: { providerId: 'p1' } }),
        res,
        mockNext(),
      );
      expect(badgesService.getProviderBadges).toHaveBeenCalledWith('p1');
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
