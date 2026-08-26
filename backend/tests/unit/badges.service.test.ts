/**
 * badges.service unit coverage (Phase 3 / P2).
 */
import { badgesService } from '../../src/modules/badges/badges.service';
import { storesRepository } from '../../src/modules/stores/stores.repository';
import { storeReviewsRepository } from '../../src/modules/stores/store-reviews.repository';
import { serviceProvidersRepository } from '../../src/modules/service-providers/service-providers.repository';
import { serviceListingsRepository } from '../../src/modules/service-listings/service-listings.repository';
import { serviceReviewsRepository } from '../../src/modules/service-reviews/service-reviews.repository';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';

jest.mock('../../src/modules/stores/stores.repository');
jest.mock('../../src/modules/stores/store-reviews.repository');
jest.mock('../../src/modules/service-providers/service-providers.repository');
jest.mock('../../src/modules/service-listings/service-listings.repository');
jest.mock('../../src/modules/service-reviews/service-reviews.repository');

const activeStore = {
  id: 'store-1',
  status: 'ACTIVE',
  createdAt: new Date('2020-01-01'),
  views: 50,
  sellerProfileId: 'sp-1',
  sellerProfile: { verificationStatus: 'UNVERIFIED' },
  _count: { followers: 0 },
};

describe('badgesService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getStoreBadges', () => {
    it('throws NotFoundError when store is missing', async () => {
      (storesRepository.findPublicById as jest.Mock).mockResolvedValue(null);
      (storesRepository.findPublicBySlug as jest.Mock).mockResolvedValue(null);

      await expect(badgesService.getStoreBadges('missing')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when store is not ACTIVE', async () => {
      (storesRepository.findPublicById as jest.Mock).mockResolvedValue({
        ...activeStore,
        status: 'SUSPENDED',
      });

      await expect(badgesService.getStoreBadges('store-1')).rejects.toThrow(NotFoundError);
    });

    it('resolves by slug when id lookup misses', async () => {
      (storesRepository.findPublicById as jest.Mock).mockResolvedValue(null);
      (storesRepository.findPublicBySlug as jest.Mock).mockResolvedValue(activeStore);
      (storeReviewsRepository.getRatingSummary as jest.Mock).mockResolvedValue({
        avg: null,
        count: 0,
      });

      const badges = await badgesService.getStoreBadges('my-slug');
      expect(Array.isArray(badges)).toBe(true);
      expect(storeReviewsRepository.getRatingSummary).toHaveBeenCalledWith('sp-1');
    });

    it('returns VERIFIED when the seller is verified', async () => {
      (storesRepository.findPublicById as jest.Mock).mockResolvedValue({
        ...activeStore,
        sellerProfile: { verificationStatus: 'VERIFIED' },
      });
      (storeReviewsRepository.getRatingSummary as jest.Mock).mockResolvedValue({
        avg: null,
        count: 0,
      });

      const badges = await badgesService.getStoreBadges('store-1');
      expect(badges.map((b) => b.type)).toContain('VERIFIED');
    });
  });

  describe('getBadgesForStores', () => {
    it('returns a Map keyed by store id using batch ratings', async () => {
      const stores = [
        { ...activeStore, id: 's1', sellerProfileId: 'sp-a' },
        {
          ...activeStore,
          id: 's2',
          sellerProfileId: 'sp-b',
          sellerProfile: { verificationStatus: 'VERIFIED' },
        },
      ] as any;

      (storeReviewsRepository.getRatingSummaries as jest.Mock).mockResolvedValue(
        new Map([
          ['sp-a', { avg: null, count: 0 }],
          ['sp-b', { avg: null, count: 0 }],
        ]),
      );

      const map = await badgesService.getBadgesForStores(stores);
      expect(map.get('s1')).toEqual([]);
      expect(map.get('s2')?.map((b) => b.type)).toContain('VERIFIED');
      expect(storeReviewsRepository.getRatingSummaries).toHaveBeenCalledWith(['sp-a', 'sp-b']);
    });
  });

  describe('getProviderBadges', () => {
    it('throws NotFoundError when provider is missing', async () => {
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue(null);
      await expect(badgesService.getProviderBadges('missing')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when the seller profile is suspended', async () => {
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue({
        id: 'p1',
        createdAt: new Date('2020-01-01'),
        completedRequestsCount: 0,
        sellerProfile: { suspended: true, verified: false },
      });
      await expect(badgesService.getProviderBadges('p1')).rejects.toThrow(NotFoundError);
    });

    it('computes badges from listing stats and rating summary', async () => {
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue({
        id: 'p1',
        createdAt: new Date('2020-01-01'),
        completedRequestsCount: 0,
        sellerProfileId: 'sp-1',
        sellerProfile: { suspended: false, verified: true },
      });
      (serviceListingsRepository.getStatsByProviderId as jest.Mock).mockResolvedValue({
        totalViews: 50,
      });
      (serviceReviewsRepository.getRatingSummary as jest.Mock).mockResolvedValue({
        avg: null,
        count: 0,
      });

      const badges = await badgesService.getProviderBadges('p1');
      expect(badges.map((b) => b.type)).toContain('VERIFIED');
    });
  });
});
