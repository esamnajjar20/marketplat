import { adsService } from '../ads/ads.service';
import { storesService } from '../stores/stores.service';
import { serviceListingsService } from '../service-listings/service-listings.service';
import { categoriesService } from '../categories/categories.service';
import { productCategoriesService } from '../product-categories/product-categories.service';
import { serviceCategoriesService } from '../service-categories/service-categories.service';
import { productsService } from '../products/products.service';
import { serviceProvidersService } from '../service-providers/service-providers.service';
import type { GetHomepageQuery } from './home.validation';

const CAROUSEL_LIMIT = 2;
const HOME_ADS_LIMIT = 6;
const SECTION_LIMIT = 8;
const STORES_SECTION_LIMIT = 6;
const PROVIDERS_SECTION_LIMIT = 6;

/**
 * Aggregates above-the-fold + below-the-fold homepage data.
 *
 * SIZE-01: when `city` is set, each location-sensitive section first tries
 * that city and only falls back to one general request when the city result
 * is empty. Without city, one general set is fetched. Categories remain full
 * trees (chips need roots; long client cache). NOT included: personalized
 * recommendations (public Cache-Control).
 */
type HomeLocationSource = 'city' | 'general';

async function withCityFallback<TQuery, TResult>(
  city: string | undefined,
  cityQuery: TQuery,
  generalQuery: TQuery,
  fetch: (query: TQuery) => Promise<TResult>,
  hasItems: (result: TResult) => boolean,
): Promise<TResult & { source: HomeLocationSource }> {
  if (!city) {
    const result = await fetch(generalQuery);
    return { ...result, source: 'general' };
  }

  const cityResult = await fetch(cityQuery);

  if (hasItems(cityResult)) {
    return { ...cityResult, source: 'city' };
  }

  const generalResult = await fetch(generalQuery);
  return { ...generalResult, source: 'general' };
}

export const homeService = {
  getHomepage: async (query: GetHomepageQuery) => {
    const cityFilter = query.city ? { city: query.city } : {};

    const [
      featuredAds,
      carouselFeaturedStores,
      adCategories,
      productCategories,
      serviceCategories,
      homeAds,
      recentProducts,
      promotedProducts,
      carouselPromotedProducts,
      homeServices,
      featuredStores,
      nearbyProviders,
    ] = await Promise.all([
      adsService.getAds({ isFeatured: true, limit: CAROUSEL_LIMIT }),
      storesService.getFeaturedStores({ limit: CAROUSEL_LIMIT }),
      categoriesService.getCategories(),
      productCategoriesService.getProductCategories(),
      serviceCategoriesService.getServiceCategories(),
      withCityFallback(
        query.city,
        {
          limit: HOME_ADS_LIMIT,
          sortBy: 'createdAt' as const,
          sortOrder: 'desc' as const,
          ...cityFilter,
        },
        {
          limit: HOME_ADS_LIMIT,
          sortBy: 'createdAt' as const,
          sortOrder: 'desc' as const,
        },
        (params) => adsService.getAds(params),
        (result) => result.items.length > 0,
      ),
      withCityFallback(
        query.city,
        {
          limit: SECTION_LIMIT,
          sortBy: 'createdAt' as const,
          sortOrder: 'desc' as const,
          ...cityFilter,
        },
        {
          limit: SECTION_LIMIT,
          sortBy: 'createdAt' as const,
          sortOrder: 'desc' as const,
        },
        (params) => productsService.getProducts(params),
        (result) => result.items.length > 0,
      ),
      // Promotions are marketplace-wide — not city-filtered
      productsService.getProducts({
        limit: CAROUSEL_LIMIT,
        sortBy: 'createdAt' as const,
        sortOrder: 'desc' as const,
        hasPromotion: true,
      }),
      // Promotions are marketplace-wide — not city-filtered
      productsService.getProducts({
        limit: SECTION_LIMIT,
        sortBy: 'createdAt' as const,
        sortOrder: 'desc' as const,
        hasPromotion: true,
      }),
      withCityFallback(
        query.city,
        {
          limit: SECTION_LIMIT,
          sortBy: 'createdAt' as const,
          sortOrder: 'desc' as const,
          ...cityFilter,
        },
        {
          limit: SECTION_LIMIT,
          sortBy: 'createdAt' as const,
          sortOrder: 'desc' as const,
        },
        (params) => serviceListingsService.getServiceListings(params),
        (result) => result.items.length > 0,
      ),
      withCityFallback(
        query.city,
        {
          limit: STORES_SECTION_LIMIT,
          ...cityFilter,
        },
        {
          limit: STORES_SECTION_LIMIT,
        },
        (params) => storesService.getStores(params),
        (result) => result.stores.length > 0,
      ),
      withCityFallback(
        query.city,
        {
          limit: PROVIDERS_SECTION_LIMIT,
          ...cityFilter,
        },
        {
          limit: PROVIDERS_SECTION_LIMIT,
        },
        (params) => serviceProvidersService.getServiceProviders(params),
        (result) => result.providers.length > 0,
      ),
    ]);

    return {
      featuredCarousel: {
        ads: featuredAds,
        products: carouselPromotedProducts,
        stores: {
          items: carouselFeaturedStores.stores,
          meta: carouselFeaturedStores.meta,
        },
      },
      categories: {
        ads: adCategories,
        products: productCategories,
        services: serviceCategories,
      },
      /** Single page for "أحدث الإعلانات" — already city-scoped when query.city set */
      adsForHome: homeAds,
      belowFold: {
        recentProducts,
        promotedProducts,
        homeServices,
        featuredStores: {
          items: featuredStores.stores,
          meta: featuredStores.meta,
          source: featuredStores.source,
        },
        nearbyProviders: {
          items: nearbyProviders.providers,
          meta: nearbyProviders.meta,
          source: nearbyProviders.source,
        },
      },
    };
  },
};
