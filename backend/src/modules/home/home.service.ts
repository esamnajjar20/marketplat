import { adsService } from '../ads/ads.service';
import { storesService } from '../stores/stores.service';
import { serviceListingsService } from '../service-listings/service-listings.service';
import { categoriesService } from '../categories/categories.service';
import { productCategoriesService } from '../product-categories/product-categories.service';
import { serviceCategoriesService } from '../service-categories/service-categories.service';
import { productsService } from '../products/products.service';
import { serviceProvidersService } from '../service-providers/service-providers.service';
import { logger } from '../../shared/utils/logger';
import type { GetHomepageQuery } from './home.validation';

const CAROUSEL_LIMIT = 2;
const CAROUSEL_PRODUCTS_LIMIT = 2;
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

/**
 * Section isolation: one failing section must not take the whole homepage
 * down (a single 500 from /home made every client fall back to ~12 separate
 * requests — the worst possible behaviour while the backend is struggling).
 * A failed section resolves to `null`; the client treats null as "not
 * seeded" and fetches that one section on its own.
 */
async function settle<T>(name: string, promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    logger.error(`[home] section "${name}" failed`, error);
    return null;
  }
}

type Sortable = { sortBy: 'createdAt'; sortOrder: 'desc' };
const LATEST: Sortable = { sortBy: 'createdAt', sortOrder: 'desc' };

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
      homeServices,
      featuredStores,
      nearbyProviders,
    ] = await Promise.all([
      settle('featuredAds', adsService.getAds({ isFeatured: true, limit: CAROUSEL_LIMIT })),
      settle('carouselStores', storesService.getFeaturedStores({ limit: CAROUSEL_LIMIT })),
      settle('adCategories', categoriesService.getCategories()),
      settle('productCategories', productCategoriesService.getProductCategories()),
      settle('serviceCategories', serviceCategoriesService.getServiceCategories()),
      settle(
        'homeAds',
        withCityFallback(
          query.city,
          { limit: HOME_ADS_LIMIT, ...LATEST, ...cityFilter },
          { limit: HOME_ADS_LIMIT, ...LATEST },
          (params) => adsService.getAds(params),
          (result) => result.items.length > 0,
        ),
      ),
      settle(
        'recentProducts',
        withCityFallback(
          query.city,
          { limit: SECTION_LIMIT, ...LATEST, ...cityFilter },
          { limit: SECTION_LIMIT, ...LATEST },
          (params) => productsService.getProducts(params),
          (result) => result.items.length > 0,
        ),
      ),
      // Promotions are marketplace-wide — not city-filtered. One query feeds
      // both the promoted rail and the carousel's product slides.
      settle(
        'promotedProducts',
        productsService.getProducts({ limit: SECTION_LIMIT, ...LATEST, hasPromotion: true }),
      ),
      settle(
        'homeServices',
        withCityFallback(
          query.city,
          { limit: SECTION_LIMIT, ...LATEST, ...cityFilter },
          { limit: SECTION_LIMIT, ...LATEST },
          (params) => serviceListingsService.getServiceListings(params),
          (result) => result.items.length > 0,
        ),
      ),
      settle(
        'featuredStores',
        withCityFallback(
          query.city,
          { limit: STORES_SECTION_LIMIT, ...cityFilter },
          { limit: STORES_SECTION_LIMIT },
          (params) => storesService.getStores(params),
          (result) => result.stores.length > 0,
        ),
      ),
      settle(
        'nearbyProviders',
        withCityFallback(
          query.city,
          { limit: PROVIDERS_SECTION_LIMIT, ...cityFilter },
          { limit: PROVIDERS_SECTION_LIMIT },
          (params) => serviceProvidersService.getServiceProviders(params),
          (result) => result.providers.length > 0,
        ),
      ),
    ]);

    const sections = [
      featuredAds,
      carouselFeaturedStores,
      adCategories,
      productCategories,
      serviceCategories,
      homeAds,
      recentProducts,
      promotedProducts,
      homeServices,
      featuredStores,
      nearbyProviders,
    ];
    // Everything failed → this is an outage, not a degraded page: surface a
    // real error instead of a 200 full of nulls that would be cached.
    if (sections.every((section) => section === null)) {
      throw new Error('Homepage: all sections failed');
    }

    return {
      featuredCarousel: {
        ads: featuredAds,
        products: promotedProducts
          ? { items: promotedProducts.items.slice(0, CAROUSEL_PRODUCTS_LIMIT), meta: promotedProducts.meta }
          : null,
        stores: carouselFeaturedStores
          ? { items: carouselFeaturedStores.stores, meta: carouselFeaturedStores.meta }
          : null,
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
        featuredStores: featuredStores
          ? { items: featuredStores.stores, meta: featuredStores.meta, source: featuredStores.source }
          : null,
        nearbyProviders: nearbyProviders
          ? { items: nearbyProviders.providers, meta: nearbyProviders.meta, source: nearbyProviders.source }
          : null,
      },
    };
  },
};

export type HomepageResult = Awaited<ReturnType<typeof homeService.getHomepage>>;

/** True when at least one section failed and was replaced by null. */
export function isHomepageDegraded(payload: HomepageResult): boolean {
  const { featuredCarousel, categories, adsForHome, belowFold } = payload;
  return [
    ...Object.values(featuredCarousel),
    ...Object.values(categories),
    adsForHome,
    ...Object.values(belowFold),
  ].some((section) => section === null);
}
