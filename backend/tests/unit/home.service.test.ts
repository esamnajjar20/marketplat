import { homeService, isHomepageDegraded } from '../../src/modules/home/home.service';
import { getHomepageSchema } from '../../src/modules/home/home.validation';
import { adsService } from '../../src/modules/ads/ads.service';
import { storesService } from '../../src/modules/stores/stores.service';
import { serviceListingsService } from '../../src/modules/service-listings/service-listings.service';
import { categoriesService } from '../../src/modules/categories/categories.service';
import { productCategoriesService } from '../../src/modules/product-categories/product-categories.service';
import { serviceCategoriesService } from '../../src/modules/service-categories/service-categories.service';
import { productsService } from '../../src/modules/products/products.service';
import { serviceProvidersService } from '../../src/modules/service-providers/service-providers.service';

jest.mock('../../src/modules/ads/ads.service');
jest.mock('../../src/modules/stores/stores.service');
jest.mock('../../src/modules/service-listings/service-listings.service');
jest.mock('../../src/modules/categories/categories.service');
jest.mock('../../src/modules/product-categories/product-categories.service');
jest.mock('../../src/modules/service-categories/service-categories.service');
jest.mock('../../src/modules/products/products.service');
jest.mock('../../src/modules/service-providers/service-providers.service');
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const meta = { total: 0, page: 1, limit: 1, totalPages: 0, hasNextPage: false, hasPrevPage: false };
const page = (n = 1) => ({ items: Array.from({ length: n }, (_, i) => ({ id: `i${i}` })), meta });

function mockAllOk() {
  (adsService.getAds as jest.Mock).mockResolvedValue(page(2));
  (storesService.getFeaturedStores as jest.Mock).mockResolvedValue({ stores: [{ id: 's1' }], meta });
  (storesService.getStores as jest.Mock).mockResolvedValue({ stores: [{ id: 's1' }], meta });
  (categoriesService.getCategories as jest.Mock).mockResolvedValue([{ id: 'c1' }]);
  (productCategoriesService.getProductCategories as jest.Mock).mockResolvedValue([{ id: 'pc1' }]);
  (serviceCategoriesService.getServiceCategories as jest.Mock).mockResolvedValue([{ id: 'sc1' }]);
  (productsService.getProducts as jest.Mock).mockResolvedValue(page(8));
  (serviceListingsService.getServiceListings as jest.Mock).mockResolvedValue(page(3));
  (serviceProvidersService.getServiceProviders as jest.Mock).mockResolvedValue({
    providers: [{ id: 'p1' }],
    meta,
  });
}

describe('homeService.getHomepage', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockAllOk();
  });

  it('returns every section and derives carousel products from the promoted list', async () => {
    const result = await homeService.getHomepage({});
    expect(result.featuredCarousel.products?.items).toHaveLength(2);
    expect(result.belowFold.promotedProducts?.items).toHaveLength(8);
    // one promoted query (not two) feeds both places
    const promotedCalls = (productsService.getProducts as jest.Mock).mock.calls.filter(
      ([q]) => q.hasPromotion === true,
    );
    expect(promotedCalls).toHaveLength(1);
    expect(isHomepageDegraded(result)).toBe(false);
  });

  it('isolates a failing section as null instead of failing the whole response', async () => {
    (serviceProvidersService.getServiceProviders as jest.Mock).mockRejectedValue(new Error('db'));
    const result = await homeService.getHomepage({});
    expect(result.belowFold.nearbyProviders).toBeNull();
    expect(result.adsForHome).not.toBeNull();
    expect(result.categories.ads).toEqual([{ id: 'c1' }]);
    expect(isHomepageDegraded(result)).toBe(true);
  });

  it('nulls both promoted rail and carousel products when the promoted query fails', async () => {
    (productsService.getProducts as jest.Mock).mockImplementation(async (q) => {
      if (q.hasPromotion) throw new Error('boom');
      return page(8);
    });
    const result = await homeService.getHomepage({});
    expect(result.belowFold.promotedProducts).toBeNull();
    expect(result.featuredCarousel.products).toBeNull();
    expect(result.belowFold.recentProducts).not.toBeNull();
  });

  it('throws when every section fails (real outage → no cacheable 200)', async () => {
    const fail = new Error('down');
    (adsService.getAds as jest.Mock).mockRejectedValue(fail);
    (storesService.getFeaturedStores as jest.Mock).mockRejectedValue(fail);
    (storesService.getStores as jest.Mock).mockRejectedValue(fail);
    (categoriesService.getCategories as jest.Mock).mockRejectedValue(fail);
    (productCategoriesService.getProductCategories as jest.Mock).mockRejectedValue(fail);
    (serviceCategoriesService.getServiceCategories as jest.Mock).mockRejectedValue(fail);
    (productsService.getProducts as jest.Mock).mockRejectedValue(fail);
    (serviceListingsService.getServiceListings as jest.Mock).mockRejectedValue(fail);
    (serviceProvidersService.getServiceProviders as jest.Mock).mockRejectedValue(fail);
    await expect(homeService.getHomepage({})).rejects.toThrow('all sections failed');
  });

  it('falls back to general results when the city has none', async () => {
    (adsService.getAds as jest.Mock).mockImplementation(async (q) =>
      q.city ? { items: [], meta } : page(2),
    );
    const result = await homeService.getHomepage({ city: 'غزة' });
    expect(result.adsForHome?.source).toBe('general');
  });
});

describe('getHomepageSchema city allow-list', () => {
  const parse = (city?: string) => getHomepageSchema.parse({ query: city === undefined ? {} : { city } }).query.city;

  it('keeps a known city (trimmed)', () => {
    expect(parse('  غزة ')).toBe('غزة');
    expect(parse('خان يونس')).toBe('خان يونس');
  });

  it('drops unknown values so they cannot fragment the CDN cache', () => {
    expect(parse('random-string-123')).toBeUndefined();
    expect(parse('')).toBeUndefined();
    expect(parse(undefined)).toBeUndefined();
  });
});
