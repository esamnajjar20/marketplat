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
 * SIZE-01: when `city` is set, list sections are fetched ONCE filtered by
 * that city — no parallel general+city doubles. Without city, one general
 * set. Categories remain full trees (chips need roots; long client cache).
 * NOT included: personalized recommendations (public Cache-Control).
 */
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
      adsService.getAds({
        limit: HOME_ADS_LIMIT,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        ...cityFilter,
      }),
      productsService.getProducts({
        limit: SECTION_LIMIT,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        ...cityFilter,
      }),
      // Promotions are marketplace-wide — not city-filtered
      productsService.getProducts({
        limit: CAROUSEL_LIMIT,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        hasPromotion: true,
      }),
      // Promotions are marketplace-wide — not city-filtered
      productsService.getProducts({
        limit: SECTION_LIMIT,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        hasPromotion: true,
      }),
      serviceListingsService.getServiceListings({
        limit: SECTION_LIMIT,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        ...cityFilter,
      }),
      storesService.getStores({ limit: STORES_SECTION_LIMIT, ...cityFilter }),
      serviceProvidersService.getServiceProviders({
        limit: PROVIDERS_SECTION_LIMIT,
        ...cityFilter,
      }),
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
        },
        nearbyProviders: {
          items: nearbyProviders.providers,
          meta: nearbyProviders.meta,
        },
      },
    };
  },
};
