import { storeReviewsRepository } from '../../src/modules/stores/store-reviews.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    storeReview: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const sellerProfileId = 'seller-profile-1';
const raterId = 'user-1';

describe('storeReviewsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findBySellerAndRater', () => {
    it('queries by the composite sellerProfileId_raterId unique key', async () => {
      (prisma.storeReview.findUnique as jest.Mock).mockResolvedValue(null);
      await storeReviewsRepository.findBySellerAndRater(sellerProfileId, raterId);
      expect(prisma.storeReview.findUnique).toHaveBeenCalledWith({
        where: { sellerProfileId_raterId: { sellerProfileId, raterId } },
      });
    });
  });

  describe('create', () => {
    it('creates a review through the given transaction client', async () => {
      const tx = { storeReview: { create: jest.fn().mockResolvedValue({ id: 'rev-1' }) } } as any;
      const data = { sellerProfileId, raterId, score: 5, comment: 'Great store' };

      await storeReviewsRepository.create(tx, data);

      expect(tx.storeReview.create).toHaveBeenCalledWith({ data });
    });

    it('does not touch the shared prisma client', async () => {
      const tx = { storeReview: { create: jest.fn().mockResolvedValue({ id: 'rev-1' }) } } as any;

      await storeReviewsRepository.create(tx, { sellerProfileId, raterId, score: 4 });

      expect(prisma.storeReview.create).not.toHaveBeenCalled();
    });
  });

  describe('findManyBySellerProfileId', () => {
    it('scopes to sellerProfileId, includes the rater, and applies default pagination', async () => {
      (prisma.storeReview.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.storeReview.count as jest.Mock).mockResolvedValue(0);

      await storeReviewsRepository.findManyBySellerProfileId(sellerProfileId, {});

      expect(prisma.storeReview.findMany).toHaveBeenCalledWith({
        where: { sellerProfileId },
        include: { rater: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.storeReview.count).toHaveBeenCalledWith({ where: { sellerProfileId } });
    });

    it('applies custom page/limit', async () => {
      (prisma.storeReview.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.storeReview.count as jest.Mock).mockResolvedValue(0);

      await storeReviewsRepository.findManyBySellerProfileId(sellerProfileId, { page: 2, limit: 5 });

      expect(prisma.storeReview.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 })
      );
    });

    it('returns reviews and total', async () => {
      const reviews = [{ id: 'rev-1' }];
      (prisma.storeReview.findMany as jest.Mock).mockResolvedValue(reviews);
      (prisma.storeReview.count as jest.Mock).mockResolvedValue(1);

      const result = await storeReviewsRepository.findManyBySellerProfileId(sellerProfileId, {});

      expect(result).toEqual({ reviews, total: 1 });
    });
  });
});
