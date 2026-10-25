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
jest.mock('../../src/modules/blocked-users', () => ({
  blockedUsersService: {
    isBlockedEitherDirection: jest.fn().mockResolvedValue(false),
  },
}));

const mockCompletedRequest = {
  id: 'req-1',
  customerId: 'customer-1',
  status: 'COMPLETED',
  listing: {
    provider: {
      sellerProfileId: 'seller-profile-1',
      sellerProfile: { userId: 'provider-user-1' },
    },
  },
};

describe('ServiceReviewsService', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

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
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb({}) as any);
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
      jest.spyOn(prisma, '$transaction').mockImplementation().mockRejectedValue({ code: 'P2002' } as any);

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

  // SEC-FIX: getReviewsForSeller previously had no check at all — not
  // even that the seller profile exists. Now mirrors
  // stores.service.ts's getStoreReviews / sellersService.getSellerRatings.
  describe('getReviewsForSeller', () => {
    it('throws NotFoundError when the seller profile does not exist', async () => {
      (sellersRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        serviceReviewsService.getReviewsForSeller('missing-seller', {})
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the seller is suspended', async () => {
      (sellersRepository.findById as jest.Mock).mockResolvedValue({
        id: 'seller-profile-1',
        suspended: true,
      });

      await expect(
        serviceReviewsService.getReviewsForSeller('seller-profile-1', {})
      ).rejects.toThrow(NotFoundError);
    });

    it('fetches reviews scoped by sellerProfileId and builds pagination meta', async () => {
      (sellersRepository.findById as jest.Mock).mockResolvedValue({
        id: 'seller-profile-1',
        suspended: false,
      });
      const reviews = [{ id: 'rev-1' }];
      (serviceReviewsRepository.findManyBySellerProfileId as jest.Mock).mockResolvedValue({
        reviews,
        total: 1,
      });

      const result = await serviceReviewsService.getReviewsForSeller('seller-profile-1', {
        page: 1,
        limit: 20,
      } as any);

      expect(serviceReviewsRepository.findManyBySellerProfileId).toHaveBeenCalledWith(
        'seller-profile-1',
        { page: 1, limit: 20 }
      );
      expect(result.items).toEqual(reviews);
      expect(result.meta.total).toBe(1);
    });
  });
});

