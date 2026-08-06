import { recommendationsService } from '../../src/modules/recommendations/recommendations.service';
import { recommendationsRepository } from '../../src/modules/recommendations/recommendations.repository';
import { adsService } from '../../src/modules/ads/ads.service';
import * as jwtUtils from '../../src/shared/utils/jwt';

jest.mock('../../src/modules/recommendations/recommendations.repository');
jest.mock('../../src/modules/ads/ads.service');

const mockAd = (id: string) => ({ id, title: `Ad ${id}`, categoryId: 'cat-1' });

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
});
