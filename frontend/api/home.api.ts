/**
 * Home API — maps to backend GET /api/v1/home.
 *
 * Aggregates above-the-fold + below-the-fold sections into one public
 * response. List slices are single-variant: city-filtered when ?city=
 * is present, otherwise general. No dual general+city payload.
 */
import { apiClient } from './client';
import type { ApiResponse, PaginationMeta } from '@/types/api.types';
import type { AdListItem } from '@/types/ad.types';
import type { StoreDirectoryItem } from '@/types/store.types';
import type { ServiceListingWithProvider, ServiceProviderDetails } from '@/types/service.types';
import type { Category } from '@/types/category.types';
import type { ProductCategory, ProductWithStore } from '@/types/product.types';
import type { ServiceCategory } from '@/types/service.types';
import type { ApiRequestConfig } from './requestConfig';

interface Page<T> {
  items: T[];
  meta: PaginationMeta;
}

export type HomepageLocationSource = 'city' | 'general';

export type HomepageLocationPage<T> = Page<T> & {
  source: HomepageLocationSource;
};

/**
 * Every section is nullable: the backend isolates section failures
 * (Promise.allSettled) and sends `null` for a slice that failed. The client
 * treats null as "not seeded" and fetches that section by itself.
 */
export interface HomepagePayload {
  featuredCarousel: {
    ads: Page<AdListItem> | null;
    products: Page<ProductWithStore> | null;
    stores: Page<StoreDirectoryItem> | null;
  };
  categories: {
    ads: Category[] | null;
    products: ProductCategory[] | null;
    services: ServiceCategory[] | null;
  };
  /** City results, or general fallback when the selected city has no results. */
  adsForHome: HomepageLocationPage<AdListItem> | null;
  /** Anonymous "الأكثر رواجًا" shelf (3 per type); a null slice means it failed server-side. */
  guestTrending?: {
    ads: AdListItem[] | null;
    products: ProductWithStore[] | null;
    services: ServiceListingWithProvider[] | null;
  };
  /** Live counters for the trust strip; null when the count failed. */
  stats?: { activeAds: number; adsLast24h: number } | null;
  belowFold?: {
    recentProducts: HomepageLocationPage<ProductWithStore> | null;
    promotedProducts: Page<ProductWithStore> | null;
    homeServices: HomepageLocationPage<ServiceListingWithProvider> | null;
    featuredStores: HomepageLocationPage<StoreDirectoryItem> | null;
    nearbyProviders: HomepageLocationPage<ServiceProviderDetails> | null;
  };
}

export const homeApi = {
  /** GET /home?city= — city omitted unless already resolved client-side */
  getHomepage: (city?: string, config?: ApiRequestConfig) =>
    apiClient.get<ApiResponse<HomepagePayload>>('/home', {
      ...config,
      params: city ? { city } : undefined,
    }),
};
