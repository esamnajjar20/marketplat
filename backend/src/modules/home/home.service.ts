import { adsService } from '../ads/ads.service';
import { storesService } from '../stores/stores.service';
import { serviceListingsService } from '../service-listings/service-listings.service';
import { categoriesService } from '../categories/categories.service';
import { productCategoriesService } from '../product-categories/product-categories.service';
import { serviceCategoriesService } from '../service-categories/service-categories.service';
import type { GetHomepageQuery } from './home.validation';

const CAROUSEL_LIMIT = 2;
const HOME_ADS_LIMIT = 6;

/**
 * One aggregation point for every above-the-fold homepage request.
 * Each call below is the exact same service call the individual
 * /ads, /stores, /service-listings, /categories, /product-categories
 * and /service-categories controllers already make — this just runs
 * them in parallel, server-side, instead of as N round trips from
 * the browser. Nothing here changes what those endpoints return.
 */
export const homeService = {
  getHomepage: async (query: GetHomepageQuery) => {
    const [
      featuredAds,
      stores,
      services,
      adCategories,
      productCategories,
      serviceCategories,
      generalAds,
    ] = await Promise.all([
      adsService.getAds({ isFeatured: true, limit: CAROUSEL_LIMIT }),
      storesService.getStores({ limit: CAROUSEL_LIMIT }),
      serviceListingsService.getServiceListings({ sortBy: 'views', limit: CAROUSEL_LIMIT }),
      categoriesService.getCategories(),
      productCategoriesService.getProductCategories(),
      serviceCategoriesService.getServiceCategories(),
      adsService.getAds({ limit: HOME_ADS_LIMIT, sortBy: 'createdAt', sortOrder: 'desc' }),
    ]);

    // Mirrors FeaturedCarousel.tsx's own fallback: only pay for the
    // second ads query when the featured list actually came back empty.
    const fallbackAds =
      featuredAds.items.length === 0
        ? await adsService.getAds({
            limit: CAROUSEL_LIMIT,
            sortBy: 'createdAt',
            sortOrder: 'desc',
          })
        : null;

    // Mirrors useAdsForHome's cityQuery: only fetched when a city was
    // actually resolvable client-side (see home.validation.ts's comment).
    const cityAds = query.city
      ? await adsService.getAds({
          city: query.city,
          limit: HOME_ADS_LIMIT,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        })
      : null;

    return {
      featuredCarousel: {
        ads: featuredAds,
        adsFallback: fallbackAds,
        stores: { items: stores.stores, meta: stores.meta },
        services,
      },
      categories: {
        ads: adCategories,
        products: productCategories,
        services: serviceCategories,
      },
      adsForHome: {
        general: generalAds,
        city: cityAds,
      },
    };
  },
};
