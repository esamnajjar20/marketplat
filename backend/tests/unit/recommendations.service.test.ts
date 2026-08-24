import { recommendationsService } from '../../src/modules/recommendations/recommendations.service';
import {
  recommendationsRepository,
  productRecommendationsRepository,
  serviceListingRecommendationsRepository,
} from '../../src/modules/recommendations/recommendations.repository';
import { adsService } from '../../src/modules/ads/ads.service';
import { productsService } from '../../src/modules/products/products.service';
import { serviceListingsService } from '../../src/modules/service-listings/service-listings.service';
import * as jwtUtils from '../../src/shared/utils/jwt';

jest.mock('../../src/modules/recommendations/recommendations.repository');
jest.mock('../../src/modules/ads/ads.service');
// FEAT-RECOMMENDATIONS-GENERALIZE (roadmap step 3): recommendations.
// service.ts now imports these two for getProductRecommendations/
// getServiceListingRecommendations' reference-lookup calls — without
// mocking them here, loading recommendationsService would pull in the
// real products/service-listings services (and transitively Prisma)
// at test-load time, same reasoning as favorites.service.test.ts's
// equivalent mocks added in PR2.
jest.mock('../../src/modules/products/products.service');
jest.mock('../../src/modules/service-listings/service-listings.service');

const mockAd = (id: string) => ({ id, title: `Ad ${id}`, categoryId: 'cat-1' });
const mockProduct = (id: string) => ({ id, name: `Product ${id}`, categoryId: 'cat-1' });
const mockListing = (id: string) => ({ id, title: `Listing ${id}`, categoryId: 'cat-1' });

describe('recommendationsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('anonymous / no signals', () => {
    it('falls back to trending when no auth header and no excludeAdId', async () => {
      (recommendationsRepository.findTrending as jest.Mock).mockResolvedValue([
        mockAd('t-1'),
        mockAd('t-2'),
      ]);

      const result = await recommendationsService.getRecommendations({}, undefined);

      expect(recommendationsRepository.findByWeightedCategories).not.toHaveBeenCalled();
      expect(recommendationsRepository.findTrending).toHaveBeenCalledWith([], 8);
      expect(result).toHaveLength(2);
    });

    it('treats an invalid/expired Bearer token the same as anonymous', async () => {
      jest.spyOn(jwtUtils, 'verifyAccessToken').mockImplementation(() => {
        throw new Error('invalid token');
      });
      (recommendationsRepository.findTrending as jest.Mock).mockResolvedValue([]);

      await recommendationsService.getRecommendations({}, 'Bearer bad-token');

      expect(recommendationsRepository.favoritedCategoryIds).not.toHaveBeenCalled();
      expect(recommendationsRepository.findTrending).toHaveBeenCalled();
    });
  });

  describe('excludeAdId (ad-detail-page mode)', () => {
    it('uses the reference ad category and excludes it from results', async () => {
      (adsService.findAdForReference as jest.Mock).mockResolvedValue({
        id: 'ad-1',
        categoryId: 'cat-1',
      });
      (recommendationsRepository.findByWeightedCategories as jest.Mock).mockResolvedValue([
        mockAd('r-1'),
      ]);
      (recommendationsRepository.findTrending as jest.Mock).mockResolvedValue([]);

      const result = await recommendationsService.getRecommendations(
        { excludeAdId: 'ad-1' },
        undefined
      );

      expect(recommendationsRepository.findByWeightedCategories).toHaveBeenCalledWith(
        [{ categoryId: 'cat-1', weight: 3 }],
        ['ad-1'],
        8
      );
      expect(result.map(a => a.id)).toEqual(['r-1']);
    });

    it('does not throw when the reference ad no longer exists', async () => {
      (adsService.findAdForReference as jest.Mock).mockResolvedValue(null);
      (recommendationsRepository.findTrending as jest.Mock).mockResolvedValue([mockAd('t-1')]);

      const result = await recommendationsService.getRecommendations(
        { excludeAdId: 'gone' },
        undefined
      );

      expect(recommendationsRepository.findByWeightedCategories).not.toHaveBeenCalled();
      expect(recommendationsRepository.findTrending).toHaveBeenCalledWith(['gone'], 8);
      expect(result).toHaveLength(1);
    });
  });

  describe('logged-in personalization', () => {
    beforeEach(() => {
      jest.spyOn(jwtUtils, 'verifyAccessToken').mockReturnValue({
        userId: 'user-1',
        sessionId: 's-1',
        jti: 'jti-1',
      });
    });

    it('merges signals taking the max weight per category, excludes owned/favorited ads', async () => {
      (recommendationsRepository.favoritedCategoryIds as jest.Mock).mockResolvedValue(['cat-1']);
      (recommendationsRepository.createdAdCategoryIds as jest.Mock).mockResolvedValue([
        'cat-1',
        'cat-2',
      ]);
      (recommendationsRepository.recentlyViewedCategoryIds as jest.Mock).mockResolvedValue([
        'cat-3',
      ]);
      (recommendationsRepository.excludedAdIds as jest.Mock).mockResolvedValue(['owned-1']);
      (recommendationsRepository.findByWeightedCategories as jest.Mock).mockResolvedValue([
        mockAd('p-1'),
      ]);
      (recommendationsRepository.findTrending as jest.Mock).mockResolvedValue([]);

      await recommendationsService.getRecommendations({}, 'Bearer good-token');

      const [weightsArg, excludeArg] = (
        recommendationsRepository.findByWeightedCategories as jest.Mock
      ).mock.calls[0];
      const weightMap = Object.fromEntries(
        weightsArg.map((w: { categoryId: string; weight: number }) => [w.categoryId, w.weight])
      );
      // cat-1: favorited (3) AND created (2) → max(3,2) = 3, not summed
      expect(weightMap['cat-1']).toBe(3);
      expect(weightMap['cat-2']).toBe(2);
      expect(weightMap['cat-3']).toBe(1);
      expect(excludeArg).toEqual(['owned-1']);
    });

    it('backfills with trending when personalized results are short of the limit', async () => {
      (recommendationsRepository.favoritedCategoryIds as jest.Mock).mockResolvedValue(['cat-1']);
      (recommendationsRepository.createdAdCategoryIds as jest.Mock).mockResolvedValue([]);
      (recommendationsRepository.recentlyViewedCategoryIds as jest.Mock).mockResolvedValue([]);
      (recommendationsRepository.excludedAdIds as jest.Mock).mockResolvedValue([]);
      (recommendationsRepository.findByWeightedCategories as jest.Mock).mockResolvedValue([
        mockAd('p-1'),
      ]);
      (recommendationsRepository.findTrending as jest.Mock).mockResolvedValue([
        mockAd('t-1'),
        mockAd('t-2'),
      ]);

      const result = await recommendationsService.getRecommendations(
        { limit: 3 },
        'Bearer good-token'
      );

      expect(recommendationsRepository.findTrending).toHaveBeenCalledWith(['p-1'], 2);
      expect(result.map(a => a.id)).toEqual(['p-1', 't-1', 't-2']);
    });

    it('does not fail the whole request when signal gathering throws', async () => {
      (recommendationsRepository.favoritedCategoryIds as jest.Mock).mockRejectedValue(
        new Error('db down')
      );
      (recommendationsRepository.createdAdCategoryIds as jest.Mock).mockResolvedValue([]);
      (recommendationsRepository.recentlyViewedCategoryIds as jest.Mock).mockResolvedValue([]);
      (recommendationsRepository.excludedAdIds as jest.Mock).mockResolvedValue([]);
      (recommendationsRepository.findTrending as jest.Mock).mockResolvedValue([mockAd('t-1')]);

      const result = await recommendationsService.getRecommendations({}, 'Bearer good-token');

      expect(recommendationsRepository.findByWeightedCategories).not.toHaveBeenCalled();
      expect(result.map(a => a.id)).toEqual(['t-1']);
    });
  });

  // FEAT-RECOMMENDATIONS-GENERALIZE (roadmap step 3)
  describe('getProductRecommendations', () => {
    it('falls back to trending when anonymous and no excludeProductId', async () => {
      (productRecommendationsRepository.findTrending as jest.Mock).mockResolvedValue([
        mockProduct('t-1'),
      ]);

      const result = await recommendationsService.getProductRecommendations({}, undefined);

      expect(productRecommendationsRepository.findByWeightedCategories).not.toHaveBeenCalled();
      expect(productRecommendationsRepository.findTrending).toHaveBeenCalledWith([], 8);
      expect(result).toHaveLength(1);
    });

    it('weights by the reference product\'s category when excludeProductId is given', async () => {
      (productsService.findProductForReference as jest.Mock).mockResolvedValue({
        id: 'product-1',
        categoryId: 'cat-1',
      });
      (productRecommendationsRepository.findByWeightedCategories as jest.Mock).mockResolvedValue([
        mockProduct('p-2'),
      ]);

      const result = await recommendationsService.getProductRecommendations(
        { excludeProductId: 'product-1' },
        undefined
      );

      expect(productsService.findProductForReference).toHaveBeenCalledWith('product-1');
      expect(productRecommendationsRepository.findByWeightedCategories).toHaveBeenCalledWith(
        [{ categoryId: 'cat-1', weight: 3 }],
        ['product-1'],
        8
      );
      expect(result).toHaveLength(1);
    });

    it('gathers favorited + created + viewed signals for a logged-in user', async () => {
      jest.spyOn(jwtUtils, 'verifyAccessToken').mockReturnValue({ userId: 'user-1' } as any);
      (productRecommendationsRepository.favoritedCategoryIds as jest.Mock).mockResolvedValue([
        'cat-1',
      ]);
      (productRecommendationsRepository.createdCategoryIds as jest.Mock).mockResolvedValue([]);
      (productRecommendationsRepository.recentlyViewedCategoryIds as jest.Mock).mockResolvedValue([
        'cat-2',
      ]);
      (productRecommendationsRepository.excludedIds as jest.Mock).mockResolvedValue([]);
      (productRecommendationsRepository.findByWeightedCategories as jest.Mock).mockResolvedValue([
        mockProduct('p-1'),
      ]);

      await recommendationsService.getProductRecommendations({}, 'Bearer good-token');

      expect(productRecommendationsRepository.favoritedCategoryIds).toHaveBeenCalledWith('user-1');
      expect(productRecommendationsRepository.createdCategoryIds).toHaveBeenCalledWith('user-1');
      // PR4A: PRODUCT_VIEW now backs a real recentlyViewedCategoryIds
      // signal, same as AD's own — this is now called, not absent.
      expect(productRecommendationsRepository.recentlyViewedCategoryIds).toHaveBeenCalledWith(
        'user-1'
      );

      const [weightsArg] = (
        productRecommendationsRepository.findByWeightedCategories as jest.Mock
      ).mock.calls[0];
      const weightMap = Object.fromEntries(
        weightsArg.map((w: { categoryId: string; weight: number }) => [w.categoryId, w.weight])
      );
      expect(weightMap['cat-1']).toBe(3); // favorited
      expect(weightMap['cat-2']).toBe(1); // viewed only
    });

    it('does not fail the whole request when signal gathering throws (viewed signal included)', async () => {
      jest.spyOn(jwtUtils, 'verifyAccessToken').mockReturnValue({ userId: 'user-1' } as any);
      (productRecommendationsRepository.favoritedCategoryIds as jest.Mock).mockResolvedValue([]);
      (productRecommendationsRepository.createdCategoryIds as jest.Mock).mockResolvedValue([]);
      (productRecommendationsRepository.recentlyViewedCategoryIds as jest.Mock).mockRejectedValue(
        new Error('db down')
      );
      (productRecommendationsRepository.findTrending as jest.Mock).mockResolvedValue([
        mockProduct('t-1'),
      ]);

      const result = await recommendationsService.getProductRecommendations(
        {},
        'Bearer good-token'
      );

      expect(productRecommendationsRepository.findByWeightedCategories).not.toHaveBeenCalled();
      expect(result.map(p => p.id)).toEqual(['t-1']);
    });

    it('backfills with trending when personalized results are short', async () => {
      jest.spyOn(jwtUtils, 'verifyAccessToken').mockReturnValue({ userId: 'user-1' } as any);
      (productRecommendationsRepository.favoritedCategoryIds as jest.Mock).mockResolvedValue([
        'cat-1',
      ]);
      (productRecommendationsRepository.createdCategoryIds as jest.Mock).mockResolvedValue([]);
      (productRecommendationsRepository.recentlyViewedCategoryIds as jest.Mock).mockResolvedValue(
        []
      );
      (productRecommendationsRepository.excludedIds as jest.Mock).mockResolvedValue([]);
      (productRecommendationsRepository.findByWeightedCategories as jest.Mock).mockResolvedValue([
        mockProduct('p-1'),
      ]);
      (productRecommendationsRepository.findTrending as jest.Mock).mockResolvedValue([
        mockProduct('t-1'),
      ]);

      const result = await recommendationsService.getProductRecommendations(
        { limit: 2 },
        'Bearer good-token'
      );

      expect(productRecommendationsRepository.findTrending).toHaveBeenCalledWith(['p-1'], 1);
      expect(result.map(p => p.id)).toEqual(['p-1', 't-1']);
    });
  });

  // FEAT-RECOMMENDATIONS-GENERALIZE (roadmap step 3)
  describe('getServiceListingRecommendations', () => {
    it('falls back to trending when anonymous and no excludeServiceListingId', async () => {
      (serviceListingRecommendationsRepository.findTrending as jest.Mock).mockResolvedValue([
        mockListing('t-1'),
      ]);

      const result = await recommendationsService.getServiceListingRecommendations({}, undefined);

      expect(serviceListingRecommendationsRepository.findByWeightedCategories).not.toHaveBeenCalled();
      expect(serviceListingRecommendationsRepository.findTrending).toHaveBeenCalledWith([], 8);
      expect(result).toHaveLength(1);
    });

    it('weights by the reference listing\'s category when excludeServiceListingId is given', async () => {
      (serviceListingsService.findServiceListingForReference as jest.Mock).mockResolvedValue({
        id: 'listing-1',
        categoryId: 'cat-1',
      });
      (serviceListingRecommendationsRepository.findByWeightedCategories as jest.Mock).mockResolvedValue([
        mockListing('l-2'),
      ]);

      const result = await recommendationsService.getServiceListingRecommendations(
        { excludeServiceListingId: 'listing-1' },
        undefined
      );

      expect(serviceListingsService.findServiceListingForReference).toHaveBeenCalledWith('listing-1');
      expect(serviceListingRecommendationsRepository.findByWeightedCategories).toHaveBeenCalledWith(
        [{ categoryId: 'cat-1', weight: 3 }],
        ['listing-1'],
        8
      );
      expect(result).toHaveLength(1);
    });

    it('a personalization failure falls through to trending rather than throwing', async () => {
      jest.spyOn(jwtUtils, 'verifyAccessToken').mockReturnValue({ userId: 'user-1' } as any);
      (serviceListingRecommendationsRepository.favoritedCategoryIds as jest.Mock).mockRejectedValue(
        new Error('db down')
      );
      (serviceListingRecommendationsRepository.createdCategoryIds as jest.Mock).mockResolvedValue([]);
      (serviceListingRecommendationsRepository.recentlyViewedCategoryIds as jest.Mock).mockResolvedValue(
        []
      );
      (serviceListingRecommendationsRepository.excludedIds as jest.Mock).mockResolvedValue([]);
      (serviceListingRecommendationsRepository.findTrending as jest.Mock).mockResolvedValue([
        mockListing('t-1'),
      ]);

      const result = await recommendationsService.getServiceListingRecommendations(
        {},
        'Bearer good-token'
      );

      expect(serviceListingRecommendationsRepository.findByWeightedCategories).not.toHaveBeenCalled();
      expect(result.map(l => l.id)).toEqual(['t-1']);
    });

    // PR4A (recommendation view signals)
    it('gathers favorited + created + viewed signals for a logged-in user', async () => {
      jest.spyOn(jwtUtils, 'verifyAccessToken').mockReturnValue({ userId: 'user-1' } as any);
      (serviceListingRecommendationsRepository.favoritedCategoryIds as jest.Mock).mockResolvedValue(
        ['cat-1']
      );
      (serviceListingRecommendationsRepository.createdCategoryIds as jest.Mock).mockResolvedValue([]);
      (serviceListingRecommendationsRepository.recentlyViewedCategoryIds as jest.Mock).mockResolvedValue(
        ['cat-2']
      );
      (serviceListingRecommendationsRepository.excludedIds as jest.Mock).mockResolvedValue([]);
      (serviceListingRecommendationsRepository.findByWeightedCategories as jest.Mock).mockResolvedValue(
        [mockListing('l-1')]
      );

      await recommendationsService.getServiceListingRecommendations({}, 'Bearer good-token');

      expect(
        serviceListingRecommendationsRepository.recentlyViewedCategoryIds
      ).toHaveBeenCalledWith('user-1');

      const [weightsArg] = (
        serviceListingRecommendationsRepository.findByWeightedCategories as jest.Mock
      ).mock.calls[0];
      const weightMap = Object.fromEntries(
        weightsArg.map((w: { categoryId: string; weight: number }) => [w.categoryId, w.weight])
      );
      expect(weightMap['cat-1']).toBe(3); // favorited
      expect(weightMap['cat-2']).toBe(1); // viewed only
    });
  });
});
