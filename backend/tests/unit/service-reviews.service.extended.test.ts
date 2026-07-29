import { serviceReviewsService } from '../../src/modules/service-reviews/service-reviews.service';
import { serviceReviewsRepository } from '../../src/modules/service-reviews/service-reviews.repository';

jest.mock('../../src/modules/service-reviews/service-reviews.repository');

const sellerProfileId = 'seller-profile-1';

describe('serviceReviewsService — additional coverage', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getReviewsForSeller', () => {
    it('returns items with pagination meta built from total/page/limit', async () => {
      const reviews = [{ id: 'review-1', score: 5 }];
      (serviceReviewsRepository.findManyBySellerProfileId as jest.Mock).mockResolvedValue({
        reviews,
        total: 1,
      });

      const result = await serviceReviewsService.getReviewsForSeller(sellerProfileId, {} as any);

      expect(result.items).toEqual(reviews);
      expect(result.meta).toEqual(
        expect.objectContaining({ total: 1, page: 1, limit: 20, totalPages: 1 })
      );
    });

    it('passes through explicit page/limit to the repository', async () => {
      (serviceReviewsRepository.findManyBySellerProfileId as jest.Mock).mockResolvedValue({
        reviews: [],
        total: 0,
      });

      await serviceReviewsService.getReviewsForSeller(sellerProfileId, { page: 2, limit: 10 } as any);

      expect(serviceReviewsRepository.findManyBySellerProfileId).toHaveBeenCalledWith(sellerProfileId, {
        page: 2,
        limit: 10,
      });
    });

    it('computes multi-page totalPages/hasNextPage correctly', async () => {
      (serviceReviewsRepository.findManyBySellerProfileId as jest.Mock).mockResolvedValue({
        reviews: [],
        total: 25,
      });

      const result = await serviceReviewsService.getReviewsForSeller(sellerProfileId, {
        page: 1,
        limit: 20,
      } as any);

      expect(result.meta).toEqual(
        expect.objectContaining({ total: 25, totalPages: 2, hasNextPage: true, hasPrevPage: false })
      );
    });

    it('returns an empty items array with zero total when the seller has no reviews', async () => {
      (serviceReviewsRepository.findManyBySellerProfileId as jest.Mock).mockResolvedValue({
        reviews: [],
        total: 0,
      });

      const result = await serviceReviewsService.getReviewsForSeller(sellerProfileId, {} as any);

      expect(result.items).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });
});
