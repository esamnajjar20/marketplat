import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    sellerProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    sellerRating: {
      create: jest.fn(),
    },
  },
}));

const sellerProfileId = 'seller-profile-1';

const mockTx = {
  sellerProfile: { create: jest.fn(), update: jest.fn() },
  sellerRating: { aggregate: jest.fn() },
  serviceReview: { aggregate: jest.fn() },
} as any;

describe('sellersRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findByUserId', () => {
    it('queries by userId', async () => {
      (prisma.sellerProfile.findUnique as jest.Mock).mockResolvedValue(null);
      await sellersRepository.findByUserId('user-1');
      expect(prisma.sellerProfile.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });
  });

  describe('findById', () => {
    it('queries by id', async () => {
      (prisma.sellerProfile.findUnique as jest.Mock).mockResolvedValue(null);
      await sellersRepository.findById(sellerProfileId);
      expect(prisma.sellerProfile.findUnique).toHaveBeenCalledWith({ where: { id: sellerProfileId } });
    });
  });

  describe('create', () => {
    it('creates with all fields including bio and avatarUrl', async () => {
      mockTx.sellerProfile.create.mockResolvedValue({ id: sellerProfileId });
      await sellersRepository.create(mockTx, 'user-1', {
        displayName: 'Shop Name',
        bio: 'A great shop',
        avatarUrl: 'https://example.com/a.png',
      });
      expect(mockTx.sellerProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          displayName: 'Shop Name',
          bio: 'A great shop',
          avatarUrl: 'https://example.com/a.png',
        },
      });
    });

    it('creates with bio and avatarUrl omitted', async () => {
      mockTx.sellerProfile.create.mockResolvedValue({ id: sellerProfileId });
      await sellersRepository.create(mockTx, 'user-1', { displayName: 'Shop Name' });
      expect(mockTx.sellerProfile.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', displayName: 'Shop Name', bio: undefined, avatarUrl: undefined },
      });
    });
  });

  describe('incrementStatsOnAdCreated', () => {
    it('increments totalAds and activeAds', async () => {
      mockTx.sellerProfile.update.mockResolvedValue({});
      await sellersRepository.incrementStatsOnAdCreated(mockTx, sellerProfileId);
      expect(mockTx.sellerProfile.update).toHaveBeenCalledWith({
        where: { id: sellerProfileId },
        data: { totalAds: { increment: 1 }, activeAds: { increment: 1 } },
      });
    });
  });

  describe('decrementActiveAdsOnSold', () => {
    it('decrements activeAds and increments totalSales', async () => {
      mockTx.sellerProfile.update.mockResolvedValue({});
      await sellersRepository.decrementActiveAdsOnSold(mockTx, sellerProfileId);
      expect(mockTx.sellerProfile.update).toHaveBeenCalledWith({
        where: { id: sellerProfileId },
        data: { activeAds: { decrement: 1 }, totalSales: { increment: 1 } },
      });
    });
  });

  describe('findPublicProfile', () => {
    it('includes only ACTIVE ads ordered by newest first', async () => {
      (prisma.sellerProfile.findUnique as jest.Mock).mockResolvedValue(null);
      await sellersRepository.findPublicProfile(sellerProfileId);
      expect(prisma.sellerProfile.findUnique).toHaveBeenCalledWith({
        where: { id: sellerProfileId },
        include: { ads: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } } },
      });
    });
  });

  describe('setVerification', () => {
    it('sets verified=true, status VERIFIED, and a verifiedAt timestamp', async () => {
      (prisma.sellerProfile.update as jest.Mock).mockResolvedValue({});
      await sellersRepository.setVerification(sellerProfileId, true);
      const call = (prisma.sellerProfile.update as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ id: sellerProfileId });
      expect(call.data.verified).toBe(true);
      expect(call.data.verificationStatus).toBe('VERIFIED');
      expect(call.data.verifiedAt).toBeInstanceOf(Date);
    });

    it('sets verified=false, status UNVERIFIED, and verifiedAt=null', async () => {
      (prisma.sellerProfile.update as jest.Mock).mockResolvedValue({});
      await sellersRepository.setVerification(sellerProfileId, false);
      const call = (prisma.sellerProfile.update as jest.Mock).mock.calls[0][0];
      expect(call.data.verified).toBe(false);
      expect(call.data.verificationStatus).toBe('UNVERIFIED');
      expect(call.data.verifiedAt).toBeNull();
    });
  });

  describe('setSuspension', () => {
    it('sets suspended=true with a suspendedAt timestamp', async () => {
      (prisma.sellerProfile.update as jest.Mock).mockResolvedValue({});
      await sellersRepository.setSuspension(sellerProfileId, true);
      const call = (prisma.sellerProfile.update as jest.Mock).mock.calls[0][0];
      expect(call.data.suspended).toBe(true);
      expect(call.data.suspendedAt).toBeInstanceOf(Date);
    });

    it('sets suspended=false with suspendedAt=null', async () => {
      (prisma.sellerProfile.update as jest.Mock).mockResolvedValue({});
      await sellersRepository.setSuspension(sellerProfileId, false);
      const call = (prisma.sellerProfile.update as jest.Mock).mock.calls[0][0];
      expect(call.data.suspended).toBe(false);
      expect(call.data.suspendedAt).toBeNull();
    });
  });

  describe('createRating', () => {
    it('creates a rating row with the given fields', async () => {
      (prisma.sellerRating.create as jest.Mock).mockResolvedValue({});
      const data = { sellerProfileId, raterId: 'user-2', adId: 'ad-1', score: 5, comment: 'Great!' };
      await sellersRepository.createRating(data);
      expect(prisma.sellerRating.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('recomputeRatingAggregate', () => {
    it('averages combined ad-rating and service-review scores', async () => {
      mockTx.sellerRating.aggregate.mockResolvedValue({ _sum: { score: 12 }, _count: { score: 3 } });
      mockTx.serviceReview.aggregate.mockResolvedValue({ _sum: { score: 8 }, _count: { score: 2 } });
      mockTx.sellerProfile.update.mockResolvedValue({});

      await sellersRepository.recomputeRatingAggregate(mockTx, sellerProfileId);

      // (12 + 8) / (3 + 2) = 4
      expect(mockTx.sellerProfile.update).toHaveBeenCalledWith({
        where: { id: sellerProfileId },
        data: { averageRating: 4, totalRatings: 5 },
      });
    });

    it('guards against division by zero when there are no ratings from either source', async () => {
      mockTx.sellerRating.aggregate.mockResolvedValue({ _sum: { score: null }, _count: { score: 0 } });
      mockTx.serviceReview.aggregate.mockResolvedValue({ _sum: { score: null }, _count: { score: 0 } });
      mockTx.sellerProfile.update.mockResolvedValue({});

      await sellersRepository.recomputeRatingAggregate(mockTx, sellerProfileId);

      expect(mockTx.sellerProfile.update).toHaveBeenCalledWith({
        where: { id: sellerProfileId },
        data: { averageRating: 0, totalRatings: 0 },
      });
    });

    it('computes correctly when only ad ratings exist (service reviews empty)', async () => {
      mockTx.sellerRating.aggregate.mockResolvedValue({ _sum: { score: 15 }, _count: { score: 3 } });
      mockTx.serviceReview.aggregate.mockResolvedValue({ _sum: { score: null }, _count: { score: 0 } });
      mockTx.sellerProfile.update.mockResolvedValue({});

      await sellersRepository.recomputeRatingAggregate(mockTx, sellerProfileId);

      expect(mockTx.sellerProfile.update).toHaveBeenCalledWith({
        where: { id: sellerProfileId },
        data: { averageRating: 5, totalRatings: 3 },
      });
    });

    it('computes correctly when only service reviews exist (ad ratings empty)', async () => {
      mockTx.sellerRating.aggregate.mockResolvedValue({ _sum: { score: null }, _count: { score: 0 } });
      mockTx.serviceReview.aggregate.mockResolvedValue({ _sum: { score: 9 }, _count: { score: 3 } });
      mockTx.sellerProfile.update.mockResolvedValue({});

      await sellersRepository.recomputeRatingAggregate(mockTx, sellerProfileId);

      expect(mockTx.sellerProfile.update).toHaveBeenCalledWith({
        where: { id: sellerProfileId },
        data: { averageRating: 3, totalRatings: 3 },
      });
    });
  });
});
