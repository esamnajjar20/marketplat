import { adsService } from '../ads/ads.service';
import { storesService } from '../stores/stores.service';
import { serviceListingsService } from '../service-listings/service-listings.service';
import { categoriesService } from '../categories/categories.service';
import { productCategoriesService } from '../product-categories/product-categories.service';
import { serviceCategoriesService } from '../service-categories/service-categories.service';
import { productsService } from '../products/products.service';
import { serviceProvidersService } from '../service-providers/service-providers.service';
import { recommendationsService } from '../recommendations/recommendations.service';
import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import type { GetHomepageQuery } from './home.validation';

const CAROUSEL_LIMIT = 2;
const CAROUSEL_PRODUCTS_LIMIT = 2;
const HOME_ADS_LIMIT = 6;
const SECTION_LIMIT = 8;
const STORES_SECTION_LIMIT = 6;
const PROVIDERS_SECTION_LIMIT = 6;
/**
 * Per-type size of the guest "الأكثر رواجًا" shelf. Must equal the
 * `perType` the frontend's ForYouMixedSection asks for (always 3: it is
 * max(3, ceil(limit / 3)) for both the 9 and the data-saver 6 limits), or the
 * seeded cache key would not match and the client would refetch anyway.
 */
const GUEST_TRENDING_PER_TYPE = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Live counters shown in the trust strip. Only ACTIVE ads count. */
async function homeStats(): Promise<{ activeAds: number; adsLast24h: number }> {
  const [activeAds, adsLast24h] = await Promise.all([
    prisma.ad.count({ where: { status: 'ACTIVE' } }),
    prisma.ad.count({ where: { status: 'ACTIVE', createdAt: { gte: new Date(Date.now() - DAY_MS) } } }),
  ]);
  return { activeAds, adsLast24h };
}

export const homeService = {
  getHomepage: async (query: GetHomepageQuery) => {
    const cityFilter = query.city ? { city: query.city } : {};

    // Legacy /home keeps its guest trending shelf; /home/feed uses one
    // mixed recommendation call instead and never enters this path.
    const guestTrendingPromise = Promise.all([
          settle(
            'guestTrendingAds',
            recommendationsService.getRecommendations(
              { limit: GUEST_TRENDING_PER_TYPE, ...(query.city ? { city: query.city } : {}) },
              undefined,
            ),
          ),
          settle(
            'guestTrendingProducts',
            recommendationsService.getProductRecommendations(
              { limit: GUEST_TRENDING_PER_TYPE, ...(query.city ? { city: query.city } : {}) },
              undefined,
            ),
          ),
          settle(
            'guestTrendingServices',
            recommendationsService.getServiceListingRecommendations(
              { limit: GUEST_TRENDING_PER_TYPE, ...(query.city ? { city: query.city } : {}) },
              undefined,
            ),
          ),
        ]).then(([ads, products, services]) => ({ ads, products, services }));

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
      stats,
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
      // Real counters for the trust strip. Cosmetic: a failure yields null.
      settle('stats', homeStats()),
    ]);

    const guestTrending = await guestTrendingPromise;

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
      guestTrending,
      stats,
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

  /**
   * Lightweight feed bootstrap: only data that is not supplied by the
   * recommendation rails. The feed uses this on the common path so it does
   * not run five extra list queries just to prepare fallbacks that are rarely
   * needed.
   */
  getHomepageBootstrap: async (query: GetHomepageQuery) => {
    const [featuredAds, carouselFeaturedStores, productPromotions, adCategories, productCategories, serviceCategories, stats] =
      await Promise.all([
        settle('featuredAds', adsService.getAds({ isFeatured: true, limit: CAROUSEL_LIMIT })),
        settle('carouselStores', storesService.getFeaturedStores({ limit: CAROUSEL_LIMIT })),
        settle(
          'promotedProducts',
          productsService.getProducts({ limit: SECTION_LIMIT, ...LATEST, hasPromotion: true }),
        ),
        settle('adCategories', categoriesService.getCategories()),
        settle('productCategories', productCategoriesService.getProductCategories()),
        settle('serviceCategories', serviceCategoriesService.getServiceCategories()),
        settle('stats', homeStats()),
      ]);

    return {
      featuredCarousel: {
        ads: featuredAds,
        products: productPromotions
          ? { items: productPromotions.items.slice(0, CAROUSEL_PRODUCTS_LIMIT), meta: productPromotions.meta }
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
      stats,
    };
  },

};

export type HomepageResult = Awaited<ReturnType<typeof homeService.getHomepage>>;

/** True when at least one section failed and was replaced by null. */
export function isHomepageDegraded(payload: HomepageResult): boolean {
  const { featuredCarousel, categories, adsForHome, belowFold, guestTrending } = payload;
  // `stats` is cosmetic and deliberately not part of the degraded check.
  return [
    ...Object.values(featuredCarousel),
    ...Object.values(categories),
    ...Object.values(guestTrending),
    adsForHome,
    ...Object.values(belowFold),
  ].some((section) => section === null);
}
