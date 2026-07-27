import { serviceReviewsService } from '../../src/modules/service-reviews/service-reviews.service';
import { serviceReviewsRepository } from '../../src/modules/service-reviews/service-reviews.repository';
import { serviceRequestsRepository } from '../../src/modules/service-requests/service-requests.repository';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { prisma } from '../../src/config/prisma';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';

jest.mock('../../src/modules/service-reviews/service-reviews.repository');
jest.mock('../../src/modules/service-requests/service-requests.repository');
jest.mock('../../src/modules/sellers/sellers.repository');

const mockCompletedRequest = {
  id: 'req-1',
  customerId: 'customer-1',
  status: 'COMPLETED',
  listing: { provider: { sellerProfileId: 'seller-profile-1' } },
};

describe('ServiceReviewsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createReview', () => {
    it('rejects a reviewer who is not the request customer', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(mockCompletedRequest);

      await expect(
        serviceReviewsService.createReview('not-the-customer', {
          requestId: 'req-1',
          score: 5,
        } as any)
      ).rejects.toThrow(ForbiddenError);
    });

    it('rejects a review on a request that is not COMPLETED', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCompletedRequest,
        status: 'IN_PROGRESS',
      });

      await expect(
        serviceReviewsService.createReview('customer-1', {
          requestId: 'req-1',
          score: 5,
        } as any)
      ).rejects.toThrow(BadRequestError);
    });

    it('rejects a duplicate review on the same request', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(mockCompletedRequest);
      (serviceReviewsRepository.findByRequestId as jest.Mock).mockResolvedValue({ id: 'existing' });

      await expect(
        serviceReviewsService.createReview('customer-1', {
          requestId: 'req-1',
          score: 5,
        } as any)
      ).rejects.toThrow(ConflictError);
    });

    it('creates a review and recomputes the seller rating aggregate for a valid completed request', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(mockCompletedRequest);
      (serviceReviewsRepository.findByRequestId as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock) = jest.fn(async (cb: any) => cb({}));
      (serviceReviewsRepository.create as jest.Mock).mockResolvedValue({ id: 'review-1' });
      (sellersRepository.recomputeRatingAggregate as jest.Mock).mockResolvedValue(undefined);

      const result = await serviceReviewsService.createReview('customer-1', {
        requestId: 'req-1',
        score: 5,
        comment: 'great',
      } as any);

      expect(result).toEqual({ id: 'review-1' });
      expect(sellersRepository.recomputeRatingAggregate).toHaveBeenCalledWith(
        expect.anything(),
        'seller-profile-1'
      );
    });

    it('translates a P2002 race-condition error into ConflictError', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(mockCompletedRequest);
      (serviceReviewsRepository.findByRequestId as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock) = jest.fn().mockRejectedValue({ code: 'P2002' });

      await expect(
        serviceReviewsService.createReview('customer-1', {
          requestId: 'req-1',
          score: 5,
        } as any)
      ).rejects.toThrow(ConflictError);
    });

    it('throws NotFoundError when the underlying request does not exist', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        serviceReviewsService.createReview('customer-1', {
          requestId: 'missing',
          score: 5,
        } as any)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
