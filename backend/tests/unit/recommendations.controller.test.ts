import { recommendationsController } from '../../src/modules/recommendations/recommendations.controller';
import { recommendationsService, resolveOptionalUserId } from '../../src/modules/recommendations/recommendations.service'; // RECS-CACHE-FIX-01
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/recommendations/recommendations.service');
// RECS-CACHE-01: the controller now goes through the SWR cache. Replace it
// with a pass-through so these tests keep exercising routing only (the
// cache itself is covered in recommendations.cache.test.ts).
jest.mock('../../src/modules/recommendations/recommendations.cache', () => ({
  getCachedRecommendations: jest.fn(
    async (
      query: unknown,
      _userId: string | null,
      build: (q: unknown) => Promise<unknown>,
    ) => ({ value: await build(query), status: 'miss' }),
  ),
}));

// The shared mockResponse() has no setHeader; the controller sets Vary and
// X-App-Cache, so add it locally.
const makeRes = () => {
  const res = mockResponse();
  (res as unknown as { setHeader: jest.Mock }).setHeader = jest.fn();
  return res;
};

describe('recommendationsController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getRecommendations (default ads) returns 200', async () => {
    (recommendationsService.getRecommendations as jest.Mock).mockResolvedValue([]);
    const res = makeRes();
    await recommendationsController.getRecommendations(
      mockRequest({ query: {} }),
      res,
      mockNext(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('exposes the cache verdict as X-App-Cache and keeps Vary: Authorization', async () => {
    (recommendationsService.getRecommendations as jest.Mock).mockResolvedValue([]);
    const res = makeRes();
    await recommendationsController.getRecommendations(
      mockRequest({ query: {} }),
      res,
      mockNext(),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Vary', 'Authorization');
    expect(res.setHeader).toHaveBeenCalledWith('X-App-Cache', 'miss');
  });

  it('passes the resolved userId down so a refresh never re-verifies the token', async () => {
    (resolveOptionalUserId as jest.Mock).mockReturnValue('user-1'); // RECS-CACHE-FIX-01
    (recommendationsService.getRecommendations as jest.Mock).mockResolvedValue([]);
    await recommendationsController.getRecommendations(
      mockRequest({ query: {}, headers: { authorization: 'Bearer t' } }),
      makeRes(),
      mockNext(),
    );
    expect(recommendationsService.getRecommendations).toHaveBeenCalledWith(
      expect.any(Object),
      'Bearer t',
      'user-1',
    );
  });

  it('routes type=mixed to getMixedRecommendations (RECS-MIXED-01)', async () => {
    (recommendationsService.getMixedRecommendations as jest.Mock).mockResolvedValue({
      ads: [],
      products: [],
      services: [],
    });
    const res = makeRes();
    await recommendationsController.getRecommendations(
      mockRequest({ query: { type: 'mixed', limit: '3' } }),
      res,
      mockNext(),
    );
    expect(recommendationsService.getMixedRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mixed', limit: 3 }),
      undefined,
      undefined,
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('routes type=store to getStoreRecommendations', async () => {
    (recommendationsService.getStoreRecommendations as jest.Mock).mockResolvedValue([]);
    const res = makeRes();
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
    const res = makeRes();
    await recommendationsController.getRecommendations(
      mockRequest({ query: { type: 'product' } }),
      res,
      mockNext(),
    );
    expect(recommendationsService.getProductRecommendations).toHaveBeenCalled();
  });

  it('routes type=service to getServiceListingRecommendations', async () => {
    (recommendationsService.getServiceListingRecommendations as jest.Mock).mockResolvedValue([]);
    const res = makeRes();
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
      makeRes(),
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
