import { recommendationsController } from '../../src/modules/recommendations/recommendations.controller';
import { recommendationsService } from '../../src/modules/recommendations/recommendations.service';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/recommendations/recommendations.service');

describe('recommendationsController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getRecommendations (default ads) returns 200', async () => {
    (recommendationsService.getRecommendations as jest.Mock).mockResolvedValue([]);
    const res = mockResponse();
    await recommendationsController.getRecommendations(
      mockRequest({ query: {} }),
      res,
      mockNext(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('routes type=store to getStoreRecommendations', async () => {
    (recommendationsService.getStoreRecommendations as jest.Mock).mockResolvedValue([]);
    const res = mockResponse();
    await recommendationsController.getRecommendations(
      mockRequest({ query: { type: 'store' } }),
      res,
      mockNext(),
    );
    expect(recommendationsService.getStoreRecommendations).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('routes type=product to getProductRecommendations', async () => {
    (recommendationsService.getProductRecommendations as jest.Mock).mockResolvedValue([]);
    const res = mockResponse();
    await recommendationsController.getRecommendations(
      mockRequest({ query: { type: 'product' } }),
      res,
      mockNext(),
    );
    expect(recommendationsService.getProductRecommendations).toHaveBeenCalled();
  });

  it('routes type=service to getServiceListingRecommendations', async () => {
    (recommendationsService.getServiceListingRecommendations as jest.Mock).mockResolvedValue([]);
    const res = mockResponse();
    await recommendationsController.getRecommendations(
      mockRequest({ query: { type: 'service' } }),
      res,
      mockNext(),
    );
    expect(recommendationsService.getServiceListingRecommendations).toHaveBeenCalled();
  });

  it('forwards errors to next', async () => {
    (recommendationsService.getRecommendations as jest.Mock).mockRejectedValue(new Error('x'));
    const next = mockNext();
    await recommendationsController.getRecommendations(
      mockRequest({ query: {} }),
      mockResponse(),
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
