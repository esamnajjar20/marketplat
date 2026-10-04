import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import { resolveOptionalUserId, recommendationsService } from '../recommendations/recommendations.service';
import { adsService } from '../ads/ads.service';
import { productsService } from '../products/products.service';
import { serviceListingsService } from '../service-listings/service-listings.service';
import { storesService } from '../stores/stores.service';
import { serviceProvidersService } from '../service-providers/service-providers.service';
import { storeTypesService } from '../store-types/store-types.service';
import { homeService } from './home.service';
import type { GetHomepageQuery } from './home.validation';

const FOR_YOU_PER_TYPE = 12;
const STORE_RAIL_LIMIT = 6;
const PROVIDER_RAIL_LIMIT = 6;

type RailSource = 'city' | 'general';

const settle = async <T>(name: string, run: () => Promise<T>): Promise<T | null> => {
  try {
    return await run();
  } catch (error) {
    logger.error(`[home/feed] section "${name}" failed`, error);
    return null;
  }
};

/**
 * One logical homepage read. The browser makes one HTTP request; the backend
 * fans out internally in parallel and reuses the mixed recommendation result
 * for both the "مخصص لك" shelf and the individual ads/products/services rails.
 *
 * The city is a ranking priority, never a hard filter. Recommendation engines
 * already backfill from the general marketplace when the selected city is
 * sparse.
 */
export const homeFeedService = {
  getHomeFeed: async (
    query: GetHomepageQuery,
    authHeader: string | undefined,
    userIdOverride?: string | null,
  ) => {
    const userId = userIdOverride !== undefined
      ? userIdOverride
      : resolveOptionalUserId(authHeader);

    // FIX HOME-CITY-EXPLICIT-ALL: three distinct states are possible now —
    //   query.city === undefined → no param sent (fall back to profile)
    //   query.city === '__ALL__'  → user explicitly chose "all cities"
    //   query.city === 'غزة'      → specific city
    // Without this distinction, a signed-in user picking "كل المدن" was
    // silently reset to their profile city by the fallback below.
    const EXPLICIT_ALL = '__ALL__';
    const isExplicitAll = query.city === EXPLICIT_ALL;
    let city: string | undefined = isExplicitAll ? undefined : query.city;

    if (!isExplicitAll && !city && userId) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { city: true },
        });
        city = user?.city?.trim() || undefined;
      } catch (error) {
        logger.error('[home/feed] failed to resolve profile city', { error, userId });
      }
    }

    const effectiveQuery: GetHomepageQuery = city ? { city } : {};

    const [base, mixed, stores, providers, storeTypes] = await Promise.all([
      settle('bootstrap', () => homeService.getHomepageBootstrap(effectiveQuery)),
      settle('recommendations', () =>
        recommendationsService.getMixedRecommendations(
          { limit: FOR_YOU_PER_TYPE, ...effectiveQuery },
          authHeader,
          userId,
        ),
      ),
      settle('stores', () =>
        recommendationsService.getStoreRecommendations(
          { limit: STORE_RAIL_LIMIT, ...effectiveQuery },
          authHeader,
          userId,
        ),
      ),
      settle('providers', () =>
        recommendationsService.getServiceProviderRecommendations(
          { limit: PROVIDER_RAIL_LIMIT, ...effectiveQuery },
          authHeader,
          userId,
        ),
      ),
      settle('storeTypes', () => storeTypesService.getActive()),
    ]);

    if (!base && !mixed && !stores && !providers && !storeTypes) {
      throw new Error('Home feed: all sections failed');
    }

    const needsEntityFallbacks = !mixed || !stores || !providers;
    const [fallbackAds, fallbackProducts, fallbackServices, fallbackStores, fallbackProviders] =
      needsEntityFallbacks
        ? await Promise.all([
            !mixed?.ads
              ? settle('fallbackAds', () => adsService.getAds({ limit: 8, sortBy: 'createdAt', sortOrder: 'desc', ...(city ? { city } : {}) }))
              : Promise.resolve(null),
            !mixed?.products
              ? settle('fallbackProducts', () => productsService.getProducts({ limit: 8, sortBy: 'createdAt', sortOrder: 'desc', ...(city ? { city } : {}) }))
              : Promise.resolve(null),
            !mixed?.services
              ? settle('fallbackServices', () => serviceListingsService.getServiceListings({ limit: 8, sortBy: 'createdAt', sortOrder: 'desc', ...(city ? { city } : {}) }))
              : Promise.resolve(null),
            !stores
              ? settle('fallbackStores', () => storesService.getStores({ limit: 6, ...(city ? { city } : {}) }))
              : Promise.resolve(null),
            !providers
              ? settle('fallbackProviders', () => serviceProvidersService.getServiceProviders({ limit: 6, ...(city ? { city } : {}) }))
              : Promise.resolve(null),
          ])
        : [null, null, null, null, null];

    const fallbackAdItems = fallbackAds?.items ?? [];
    const fallbackProductItems = fallbackProducts?.items ?? [];
    const fallbackServiceItems = fallbackServices?.items ?? [];
    const fallbackStoreItems = fallbackStores?.stores ?? [];
    const fallbackProviderItems = fallbackProviders?.providers ?? [];

    const ads = mixed?.ads ?? fallbackAdItems;
    const products = mixed?.products ?? fallbackProductItems;
    const services = mixed?.services ?? fallbackServiceItems;
    const storeItems = stores ?? fallbackStoreItems;
    const providerItems = providers ?? fallbackProviderItems;
    const source: RailSource = city ? 'city' : 'general';

    return {
      meta: {
        city: city ?? null,
        citySource:
          query.city && !isExplicitAll ? 'browse'
          : city && !query.city ? 'profile'
          : 'none',
        personalized: Boolean(userId),
        explicitAll: isExplicitAll,
      },
      bootstrap: {
        categories: base?.categories ?? { ads: null, products: null, services: null },
        storeTypes: storeTypes ?? [],
        stats: base?.stats ?? null,
      },
      featured: {
        carousel: base?.featuredCarousel ?? { ads: null, products: null, stores: null },
      },
      rails: {
        forYou: { ads, products, services },
        ads: { items: ads, source },
        products: { items: products, source },
        services: { items: services, source },
        stores: { items: storeItems, source },
        providers: { items: providerItems, source },
      },
    };
  },
};

export type HomeFeedResult = Awaited<ReturnType<typeof homeFeedService.getHomeFeed>>;
