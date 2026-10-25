import { serviceReviewsController } from '../../src/modules/service-reviews/service-reviews.controller';
import { serviceReviewsService } from '../../src/modules/service-reviews/service-reviews.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/service-reviews/service-reviews.service');
jest.mock('../../src/shared/utils/requireUser');

const mockReview = { id: 'review-1', score: 5 } as any;

describe('serviceReviewsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1' });
  });

  describe('createReview', () => {
    it('returns 201 with the created review on success', async () => {
      const req = mockRequest({ body: { requestId: 'request-1', score: 5 } });
      const res = mockResponse();
      const next = mockNext();
      (serviceReviewsService.createReview as jest.Mock).mockResolvedValue(mockReview);

      await serviceReviewsController.createReview(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockReview })
      );
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ body: { requestId: 'request-1', score: 5 } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await serviceReviewsController.createReview(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) on validation failure without invoking the service', async () => {
      const req = mockRequest({ body: { requestId: 'request-1', score: 10 } });
      const res = mockResponse();
      const next = mockNext();

      await serviceReviewsController.createReview(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceReviewsService.createReview).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws ForbiddenError', async () => {
      const req = mockRequest({ body: { requestId: 'request-1', score: 5 } });
      const res = mockResponse();
      const next = mockNext();
      (serviceReviewsService.createReview as jest.Mock).mockRejectedValue(
        new ForbiddenError('Only the customer of this request can leave a review.')
      );

      await serviceReviewsController.createReview(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('calls next(error) when the service throws BadRequestError (not completed)', async () => {
      const req = mockRequest({ body: { requestId: 'request-1', score: 5 } });
      const res = mockResponse();
      const next = mockNext();
      (serviceReviewsService.createReview as jest.Mock).mockRejectedValue(
        new BadRequestError('You can only review a completed service request.')
      );

      await serviceReviewsController.createReview(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it('calls next(error) when the service throws ConflictError (already reviewed)', async () => {
      const req = mockRequest({ body: { requestId: 'request-1', score: 5 } });
      const res = mockResponse();
      const next = mockNext();
      (serviceReviewsService.createReview as jest.Mock).mockRejectedValue(
        new ConflictError('This request has already been reviewed.')
      );

      await serviceReviewsController.createReview(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ConflictError));
    });
  });

  describe('getReviewsForSeller', () => {
    it('returns 200 with items and pagination meta on success', async () => {
      const req = mockRequest({ params: { sellerProfileId: 'seller-profile-1' }, query: {} });
      const res = mockResponse();
      const next = mockNext();
      const items = [mockReview];
      const meta = { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false };
      (serviceReviewsService.getReviewsForSeller as jest.Mock).mockResolvedValue({ items, meta });

      await serviceReviewsController.getReviewsForSeller(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: items, meta: { pagination: meta } })
      );
    });

    it('calls next(error) when the sellerProfileId param is missing', async () => {
      const req = mockRequest({ params: { sellerProfileId: '' }, query: {} });
      const res = mockResponse();
      const next = mockNext();

      await serviceReviewsController.getReviewsForSeller(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceReviewsService.getReviewsForSeller).not.toHaveBeenCalled();
    });

    it('calls next(error) when the limit query param exceeds the maximum', async () => {
      const req = mockRequest({
        params: { sellerProfileId: 'seller-profile-1' },
        query: { limit: '101' },
      });
      const res = mockResponse();
      const next = mockNext();

      await serviceReviewsController.getReviewsForSeller(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceReviewsService.getReviewsForSeller).not.toHaveBeenCalled();
    });

    it('does not require authentication (public endpoint)', async () => {
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });
      const req = mockRequest({ params: { sellerProfileId: 'seller-profile-1' }, query: {} });
      const res = mockResponse();
      const next = mockNext();
      (serviceReviewsService.getReviewsForSeller as jest.Mock).mockResolvedValue({
        items: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0, hasNextPage: false, hasPrevPage: false },
      });

      await serviceReviewsController.getReviewsForSeller(req, res, next);

      // requireUser is never called by this controller action, so throwing
      // from the mock has no effect — the call should still succeed.
      expect(res.status).toHaveBeenCalledWith(200);
      expect(next).not.toHaveBeenCalled();
    });
  });
});
