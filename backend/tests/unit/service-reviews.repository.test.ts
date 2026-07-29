import { serviceReviewsRepository } from '../../src/modules/service-reviews/service-reviews.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    serviceReview: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const mockTx = {
  serviceReview: { create: jest.fn() },
} as any;

const sellerProfileId = 'seller-profile-1';
const requestId = 'request-1';

describe('serviceReviewsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates a review with all fields under the transaction client', async () => {
      const data = {
        requestId,
        raterId: 'customer-1',
        sellerProfileId,
        score: 5,
        comment: 'Great service',
      };
      mockTx.serviceReview.create.mockResolvedValue({ id: 'review-1', ...data });

      await serviceReviewsRepository.create(mockTx, data);

      expect(mockTx.serviceReview.create).toHaveBeenCalledWith({ data });
    });

    it('creates a review without an optional comment', async () => {
      const data = {
        requestId,
        raterId: 'customer-1',
        sellerProfileId,
        score: 4,
      };
      mockTx.serviceReview.create.mockResolvedValue({ id: 'review-1', ...data });

      await serviceReviewsRepository.create(mockTx, data);

      expect(mockTx.serviceReview.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('findByRequestId', () => {
    it('queries by requestId', async () => {
      (prisma.serviceReview.findUnique as jest.Mock).mockResolvedValue(null);
      await serviceReviewsRepository.findByRequestId(requestId);
      expect(prisma.serviceReview.findUnique).toHaveBeenCalledWith({ where: { requestId } });
    });

    it('returns null when no review exists for the request', async () => {
      (prisma.serviceReview.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await serviceReviewsRepository.findByRequestId(requestId);
      expect(result).toBeNull();
    });
  });

  describe('findManyBySellerProfileId', () => {
    it('applies default pagination when page/limit are omitted', async () => {
      (prisma.serviceReview.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.serviceReview.count as jest.Mock).mockResolvedValue(0);

      await serviceReviewsRepository.findManyBySellerProfileId(sellerProfileId, {});

      expect(prisma.serviceReview.findMany).toHaveBeenCalledWith({
        where: { sellerProfileId },
        include: { rater: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.serviceReview.count).toHaveBeenCalledWith({ where: { sellerProfileId } });
    });

    it('applies custom pagination when page/limit are provided', async () => {
      (prisma.serviceReview.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.serviceReview.count as jest.Mock).mockResolvedValue(0);

      await serviceReviewsRepository.findManyBySellerProfileId(sellerProfileId, {
        page: 3,
        limit: 5,
      });

      expect(prisma.serviceReview.findMany).toHaveBeenCalledWith({
        where: { sellerProfileId },
        include: { rater: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 5,
      });
    });

    it('returns reviews and total from the parallel queries', async () => {
      const reviews = [{ id: 'r1' }, { id: 'r2' }];
      (prisma.serviceReview.findMany as jest.Mock).mockResolvedValue(reviews);
      (prisma.serviceReview.count as jest.Mock).mockResolvedValue(2);

      const result = await serviceReviewsRepository.findManyBySellerProfileId(sellerProfileId, {});

      expect(result).toEqual({ reviews, total: 2 });
    });
  });
});
