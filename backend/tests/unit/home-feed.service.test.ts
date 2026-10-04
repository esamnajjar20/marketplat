import { homeFeedService } from '../../src/modules/home/home-feed.service';
import { recommendationsService } from '../../src/modules/recommendations/recommendations.service';
import { homeService } from '../../src/modules/home/home.service';
import { storeTypesService } from '../../src/modules/store-types/store-types.service';
import { logger } from '../../src/shared/utils/logger';
import { homeFeedShortRailTotal } from '../../src/shared/utils/metrics';

jest.mock('../../src/config/prisma', () => ({ prisma: { user: { findUnique: jest.fn() } } }));
jest.mock('../../src/modules/recommendations/recommendations.service', () => ({
  resolveOptionalUserId: jest.fn(() => null),
  recommendationsService: {
    getMixedRecommendations: jest.fn(),
    getStoreRecommendations: jest.fn().mockResolvedValue([]),
    getServiceProviderRecommendations: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('../../src/modules/home/home.service');
jest.mock('../../src/modules/store-types/store-types.service');
jest.mock('../../src/modules/ads/ads.service');
jest.mock('../../src/modules/products/products.service');
jest.mock('../../src/modules/service-listings/service-listings.service');
jest.mock('../../src/modules/stores/stores.service');
jest.mock('../../src/modules/service-providers/service-providers.service');
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/shared/utils/metrics', () => ({
  homeFeedShortRailTotal: { inc: jest.fn() },
}));

const items = (prefix: string, n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` }));

const mockMixed = (ads: number, products: number, services: number) =>
  (recommendationsService.getMixedRecommendations as jest.Mock).mockResolvedValue({
    ads: items('ad', ads),
    products: items('p', products),
    services: items('s', services),
  });

describe('homeFeedService.getHomeFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (homeService.getHomepageBootstrap as jest.Mock).mockResolvedValue({
      categories: { ads: [], products: [], services: [] },
      stats: null,
      featuredCarousel: { ads: null, products: null, stores: null },
    });
    (storeTypesService.getActive as jest.Mock).mockResolvedValue([]);
  });

  it('asks for the full pool, gives the shelf the top 12 and the per-type rails the whole pool', async () => {
    mockMixed(24, 24, 24);

    const feed = await homeFeedService.getHomeFeed({}, undefined, null);

    expect((recommendationsService.getMixedRecommendations as jest.Mock).mock.calls[0][0].limit).toBe(24);
    expect(feed.rails.forYou.ads).toHaveLength(12);
    expect(feed.rails.forYou.ads[0]).toEqual({ id: 'ad-0' });
    expect(feed.rails.ads.items).toHaveLength(24);
    expect(feed.rails.products.items).toHaveLength(24);
    expect(feed.rails.services.items).toHaveLength(24);
  });

  it('flags short rails with a warning and a counter, per rail', async () => {
    mockMixed(2, 10, 10);

    await homeFeedService.getHomeFeed({}, undefined, 'user-1');

    expect(homeFeedShortRailTotal.inc).toHaveBeenCalledTimes(1);
    expect(homeFeedShortRailTotal.inc).toHaveBeenCalledWith({ rail: 'ads', personalized: 'true' });
    expect(logger.warn).toHaveBeenCalledWith(
      '[home/feed] short recommendation rail',
      expect.objectContaining({ short: ['ads'], counts: { ads: 2, products: 10, services: 10 } }),
    );
  });

  it('stays silent when every rail is healthy', async () => {
    mockMixed(8, 8, 8);

    await homeFeedService.getHomeFeed({}, undefined, null);

    expect(homeFeedShortRailTotal.inc).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
