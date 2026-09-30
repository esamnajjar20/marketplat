import { recommendationsService } from '../../src/modules/recommendations/recommendations.service';
import {
  recommendationsRepository,
  productRecommendationsRepository,
  serviceListingRecommendationsRepository,
  storeRecommendationsRepository,
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
const mockStore = (id: string) => ({ id, name: `Store ${id}` });

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
      expect(recommendationsRepository.findTrending).toHaveBeenCalledWith([], 8, null);
      expect(result).toHaveLength(2);
    });

    it('treats an invalid/expired Bearer token the same as anonymous', async () => {
      jest.spyOn(jwtUtils, 'verifyAccessToken').mockImplementation(() => {
        throw new Error('invalid token');
      });
      (recommendationsRepository.findTrending as jest.Mock).mockResolvedValue([]);

      await recommendationsService.getRecommendations({}, 'Bearer bad-token');

      expect(recommendationsRepository.getAdCategoryInterest).not.toHaveBeenCalled();
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
        [{ categoryId: 'cat-1', weight: 6 }],
        ['ad-1'],
        8,
        null
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
      expect(recommendationsRepository.findTrending).toHaveBeenCalledWith(['gone'], 8, null);
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
      (recommendationsRepository.getAdCategoryInterest as jest.Mock).mockResolvedValue([
        { categoryId: 'cat-1', score: 6 },
        { categoryId: 'cat-2', score: 2 },
        { categoryId: 'cat-3', score: 1 },
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
      expect(weightMap['cat-1']).toBe(6);
      expect(weightMap['cat-2']).toBe(2);
      expect(weightMap['cat-3']).toBe(1);
      expect(excludeArg).toEqual(['owned-1']);
    });

    it('backfills with trending when personalized results are short of the limit', async () => {
      (recommendationsRepository.getAdCategoryInterest as jest.Mock).mockResolvedValue([
        { categoryId: 'cat-1', score: 6 },
      ]);
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

      expect(recommendationsRepository.findTrending).toHaveBeenCalledWith(['p-1'], 2, null);
      expect(result.map(a => a.id)).toEqual(['p-1', 't-1', 't-2']);
    });

    it('does not fail the whole request when signal gathering throws', async () => {
      (recommendationsRepository.getAdCategoryInterest as jest.Mock).mockRejectedValue(
        new Error('db down')
      );
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
      expect(productRecommendationsRepository.findTrending).toHaveBeenCalledWith([], 8, null);
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
      // Prevent trending backfill from padding the result past the personalized hit.
      (productRecommendationsRepository.findTrending as jest.Mock).mockResolvedValue([]);

      const result = await recommendationsService.getProductRecommendations(
        { excludeProductId: 'product-1' },
        undefined
      );

      expect(productsService.findProductForReference).toHaveBeenCalledWith('product-1');
      expect(productRecommendationsRepository.findByWeightedCategories).toHaveBeenCalledWith(
        [{ categoryId: 'cat-1', weight: 6 }],
        ['product-1'],
        8,
        null
      );
      expect(result).toHaveLength(1);
    });

    it('gathers favorited + created + viewed signals for a logged-in user', async () => {
      jest.spyOn(jwtUtils, 'verifyAccessToken').mockReturnValue({ userId: 'user-1' } as any);
      (productRecommendationsRepository.getProductCategoryInterest as jest.Mock).mockResolvedValue([
        { categoryId: 'cat-1', score: 6 },
        { categoryId: 'cat-2', score: 1 },
      ]);
      (productRecommendationsRepository.excludedIds as jest.Mock).mockResolvedValue([]);
      (productRecommendationsRepository.findByWeightedCategories as jest.Mock).mockResolvedValue([
        mockProduct('p-1'),
      ]);

      await recommendationsService.getProductRecommendations({}, 'Bearer good-token');

      expect(productRecommendationsRepository.getProductCategoryInterest).toHaveBeenCalledWith(
        'user-1'
      );

      const [weightsArg] = (
        productRecommendationsRepository.findByWeightedCategories as jest.Mock
      ).mock.calls[0];
      const weightMap = Object.fromEntries(
        weightsArg.map((w: { categoryId: string; weight: number }) => [w.categoryId, w.weight])
      );
      expect(weightMap['cat-1']).toBe(6);
      expect(weightMap['cat-2']).toBe(1);
    });

    it('does not fail the whole request when signal gathering throws (viewed signal included)', async () => {
      jest.spyOn(jwtUtils, 'verifyAccessToken').mockReturnValue({ userId: 'user-1' } as any);
      (productRecommendationsRepository.getProductCategoryInterest as jest.Mock).mockRejectedValue(
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
      (productRecommendationsRepository.getProductCategoryInterest as jest.Mock).mockResolvedValue([
        { categoryId: 'cat-1', score: 6 },
      ]);
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

      expect(productRecommendationsRepository.findTrending).toHaveBeenCalledWith(['p-1'], 1, null);
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
      expect(serviceListingRecommendationsRepository.findTrending).toHaveBeenCalledWith([], 8, null);
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
      (serviceListingRecommendationsRepository.findTrending as jest.Mock).mockResolvedValue([]);

      const result = await recommendationsService.getServiceListingRecommendations(
        { excludeServiceListingId: 'listing-1' },
        undefined
      );

      expect(serviceListingsService.findServiceListingForReference).toHaveBeenCalledWith('listing-1');
      expect(serviceListingRecommendationsRepository.findByWeightedCategories).toHaveBeenCalledWith(
        [{ categoryId: 'cat-1', weight: 6 }],
        ['listing-1'],
        8,
        null
      );
      expect(result).toHaveLength(1);
    });

    it('a personalization failure falls through to trending rather than throwing', async () => {
      jest.spyOn(jwtUtils, 'verifyAccessToken').mockReturnValue({ userId: 'user-1' } as any);
      (serviceListingRecommendationsRepository.getServiceCategoryInterest as jest.Mock).mockRejectedValue(
        new Error('db down')
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
      (serviceListingRecommendationsRepository.getServiceCategoryInterest as jest.Mock).mockResolvedValue([
        { categoryId: 'cat-1', score: 6 },
        { categoryId: 'cat-2', score: 1 },
      ]);
      (serviceListingRecommendationsRepository.excludedIds as jest.Mock).mockResolvedValue([]);
      (serviceListingRecommendationsRepository.findByWeightedCategories as jest.Mock).mockResolvedValue(
        [mockListing('l-1')]
      );

      await recommendationsService.getServiceListingRecommendations({}, 'Bearer good-token');

      expect(
        serviceListingRecommendationsRepository.getServiceCategoryInterest
      ).toHaveBeenCalledWith('user-1');

      const [weightsArg] = (
        serviceListingRecommendationsRepository.findByWeightedCategories as jest.Mock
      ).mock.calls[0];
      const weightMap = Object.fromEntries(
        weightsArg.map((w: { categoryId: string; weight: number }) => [w.categoryId, w.weight])
      );
      expect(weightMap['cat-1']).toBe(6);
      expect(weightMap['cat-2']).toBe(1);
    });
  });

  // PR4B (Store Recommendations)
  describe('getStoreRecommendations', () => {
    it('anonymous caller: gathers no signals, excludes nothing but passes lat/lng/limit through', async () => {
      (storeRecommendationsRepository.findRanked as jest.Mock).mockResolvedValue([mockStore('s-1')]);

      const result = await recommendationsService.getStoreRecommendations(
        { lat: 31.5, lng: 34.4 },
        undefined
      );

      expect(storeRecommendationsRepository.followedStoreIds).not.toHaveBeenCalled();
      expect(storeRecommendationsRepository.favoritedStoreIds).not.toHaveBeenCalled();
      expect(storeRecommendationsRepository.ownStoreId).not.toHaveBeenCalled();
      expect(storeRecommendationsRepository.findRanked).toHaveBeenCalledWith({
        excludeIds: [],
        lat: 31.5,
        lng: 34.4,
        limit: 8,
      });
      expect(result.map(s => s.id)).toEqual(['s-1']);
    });

    it('treats an invalid/expired Bearer token the same as anonymous', async () => {
      jest.spyOn(jwtUtils, 'verifyAccessToken').mockImplementation(() => {
        throw new Error('invalid token');
      });
      (storeRecommendationsRepository.findRanked as jest.Mock).mockResolvedValue([]);

      await recommendationsService.getStoreRecommendations({}, 'Bearer bad-token');

      expect(storeRecommendationsRepository.followedStoreIds).not.toHaveBeenCalled();
      expect(storeRecommendationsRepository.findRanked).toHaveBeenCalledWith({
        excludeIds: [],
        lat: undefined,
        lng: undefined,
        limit: 8,
      });
    });

    it('excludeStoreId is excluded even for an anonymous caller', async () => {
      (storeRecommendationsRepository.findRanked as jest.Mock).mockResolvedValue([]);

      await recommendationsService.getStoreRecommendations({ excludeStoreId: 'ref-store' }, undefined);

      expect(storeRecommendationsRepository.findRanked).toHaveBeenCalledWith({
        excludeIds: ['ref-store'],
        lat: undefined,
        lng: undefined,
        limit: 8,
      });
    });

    describe('logged-in personalization', () => {
      beforeEach(() => {
        jest.spyOn(jwtUtils, 'verifyAccessToken').mockReturnValue({
          userId: 'user-1',
          sessionId: 's-1',
          jti: 'jti-1',
        } as any);
      });

      it('excludes followed + favorited + owned stores (deduped) from the ranked query', async () => {
        (storeRecommendationsRepository.followedStoreIds as jest.Mock).mockResolvedValue([
          'store-followed',
          'store-both',
        ]);
        (storeRecommendationsRepository.favoritedStoreIds as jest.Mock).mockResolvedValue([
          'store-favorited',
          'store-both',
        ]);
        (storeRecommendationsRepository.ownStoreId as jest.Mock).mockResolvedValue('store-own');
        (storeRecommendationsRepository.findRanked as jest.Mock).mockResolvedValue([mockStore('p-1')]);

        await recommendationsService.getStoreRecommendations({}, 'Bearer good-token');

        const [callArg] = (storeRecommendationsRepository.findRanked as jest.Mock).mock.calls[0];
        expect(new Set(callArg.excludeIds)).toEqual(
          new Set(['store-followed', 'store-both', 'store-favorited', 'store-own'])
        );
        // No duplicate entries despite 'store-both' appearing in two signals.
        expect(callArg.excludeIds).toHaveLength(4);
      });

      it('does not add an exclusion when the user owns no store', async () => {
        (storeRecommendationsRepository.followedStoreIds as jest.Mock).mockResolvedValue([]);
        (storeRecommendationsRepository.favoritedStoreIds as jest.Mock).mockResolvedValue([]);
        (storeRecommendationsRepository.ownStoreId as jest.Mock).mockResolvedValue(null);
        (storeRecommendationsRepository.findRanked as jest.Mock).mockResolvedValue([]);

        await recommendationsService.getStoreRecommendations({}, 'Bearer good-token');

        const [callArg] = (storeRecommendationsRepository.findRanked as jest.Mock).mock.calls[0];
        expect(callArg.excludeIds).toEqual([]);
      });

      it('does not fail the whole request when signal gathering throws', async () => {
        (storeRecommendationsRepository.followedStoreIds as jest.Mock).mockRejectedValue(
          new Error('db down')
        );
        (storeRecommendationsRepository.favoritedStoreIds as jest.Mock).mockResolvedValue([]);
        (storeRecommendationsRepository.ownStoreId as jest.Mock).mockResolvedValue(null);
        (storeRecommendationsRepository.findRanked as jest.Mock).mockResolvedValue([mockStore('t-1')]);

        const result = await recommendationsService.getStoreRecommendations({}, 'Bearer good-token');

        const [callArg] = (storeRecommendationsRepository.findRanked as jest.Mock).mock.calls[0];
        expect(callArg.excludeIds).toEqual([]);
        expect(result.map(s => s.id)).toEqual(['t-1']);
      });

      it('respects a caller-supplied limit', async () => {
        (storeRecommendationsRepository.followedStoreIds as jest.Mock).mockResolvedValue([]);
        (storeRecommendationsRepository.favoritedStoreIds as jest.Mock).mockResolvedValue([]);
        (storeRecommendationsRepository.ownStoreId as jest.Mock).mockResolvedValue(null);
        (storeRecommendationsRepository.findRanked as jest.Mock).mockResolvedValue([]);

        await recommendationsService.getStoreRecommendations({ limit: 3 }, 'Bearer good-token');

        const [callArg] = (storeRecommendationsRepository.findRanked as jest.Mock).mock.calls[0];
        expect(callArg.limit).toBe(3);
      });
    });
  });

  // RECS-CACHE-01: the SWR cache resolves the caller once and passes it in,
  // so a background refresh never re-verifies an (possibly expired) token.
  describe('userIdOverride (RECS-CACHE-01)', () => {
    it('uses the supplied userId and does NOT re-verify the Bearer token', async () => {
      const verifySpy = jest.spyOn(jwtUtils, 'verifyAccessToken');
      verifySpy.mockClear();
      (recommendationsRepository.getAdCategoryInterest as jest.Mock).mockResolvedValue([
        { categoryId: 'cat-1', score: 6 },
      ]);
      (recommendationsRepository.excludedAdIds as jest.Mock).mockResolvedValue([]);
      (recommendationsRepository.findByWeightedCategories as jest.Mock).mockResolvedValue([
        mockAd('p-1'),
      ]);
      (recommendationsRepository.findTrending as jest.Mock).mockResolvedValue([]);

      await recommendationsService.getRecommendations({ limit: 1 }, 'Bearer expired', 'user-9');

      expect(verifySpy).not.toHaveBeenCalled();
      expect(recommendationsRepository.getAdCategoryInterest).toHaveBeenCalledWith('user-9');
    });

    it('null means guest even when a Bearer header is present', async () => {
      (recommendationsRepository.findTrending as jest.Mock).mockResolvedValue([mockAd('t-1')]);

      await recommendationsService.getRecommendations({ limit: 1 }, 'Bearer whatever', null);

      expect(recommendationsRepository.getAdCategoryInterest).not.toHaveBeenCalled();
      expect(recommendationsRepository.findTrending).toHaveBeenCalled();
    });
  });

  describe('getMixedRecommendations (RECS-MIXED-01)', () => {
    const stubAllTrending = () => {
      (recommendationsRepository.findTrending as jest.Mock).mockResolvedValue([mockAd('a-1')]);
      (productRecommendationsRepository.findTrending as jest.Mock).mockResolvedValue([mockProduct('p-1')]);
      (serviceListingRecommendationsRepository.findTrending as jest.Mock).mockResolvedValue([
        mockListing('s-1'),
      ]);
    };

    it('returns all three rails from one call (guest)', async () => {
      stubAllTrending();
      const result = await recommendationsService.getMixedRecommendations({ limit: 3 }, undefined, null);
      expect(result.ads).toHaveLength(1);
      expect(result.products).toHaveLength(1);
      expect(result.services).toHaveLength(1);
    });

    it('isolates a failing rail: it becomes null, the others still return', async () => {
      stubAllTrending();
      (productRecommendationsRepository.findTrending as jest.Mock).mockRejectedValue(new Error('db'));
      const result = await recommendationsService.getMixedRecommendations({ limit: 3 }, undefined, null);
      expect(result.products).toBeNull();
      expect(result.ads).toHaveLength(1);
      expect(result.services).toHaveLength(1);
    });

    it('does not leak per-entity exclude ids into the other rails', async () => {
      stubAllTrending();
      await recommendationsService.getMixedRecommendations(
        { limit: 3, excludeAdId: 'ad-x', excludeProductId: 'prod-x' },
        undefined,
        null,
      );
      expect(adsService.findAdForReference).not.toHaveBeenCalled();
      expect(productsService.findProductForReference).not.toHaveBeenCalled();
    });
  });
});
