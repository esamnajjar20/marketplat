import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { AdListItem } from '@/types/ad.types';
import type { ProductCategory, ProductWithStore } from '@/types/product.types';
import type { Category } from '@/types/category.types';
import type { ServiceCategory, ServiceListingWithProvider, ServiceProviderDetails } from '@/types/service.types';
import type { StoreType, StoreWithSeller } from '@/types/store.types';
import type { HomepageLocationSource } from './home.api';
import { queryKeys } from '@/lib/queryKeys';

export interface HomeFeedPayload {
  meta: {
    city: string | null;
    citySource: 'browse' | 'profile' | 'none';
    personalized: boolean;
    /** FIX HOME-CITY-EXPLICIT-ALL: true when the user picked "كل المدن". */
    explicitAll?: boolean;
  };
  bootstrap: {
    categories: {
      ads: Category[] | null;
      products: ProductCategory[] | null;
      services: ServiceCategory[] | null;
    };
    storeTypes: StoreType[];
    stats: { activeAds: number; adsLast24h: number } | null;
  };
  featured: {
    carousel: {
      ads: { items: AdListItem[] } | null;
      products: { items: ProductWithStore[] } | null;
      stores: { items: StoreWithSeller[] } | null;
    };
  };
  rails: {
    forYou: {
      ads: AdListItem[];
      products: ProductWithStore[];
      services: ServiceListingWithProvider[];
    };
    ads: { items: AdListItem[]; source: HomepageLocationSource };
    products: { items: ProductWithStore[]; source: HomepageLocationSource };
    services: { items: ServiceListingWithProvider[]; source: HomepageLocationSource };
    stores: { items: StoreWithSeller[]; source: HomepageLocationSource };
    providers: { items: ServiceProviderDetails[]; source: HomepageLocationSource };
  };
}

export const homeFeedQueryKey = (
  city: string | undefined,
  userId: string | null,
  explicitAll: boolean,
) => queryKeys.home.feed(city, userId, explicitAll);

/** Shared by both endpoints: FIX HOME-CITY-EXPLICIT-ALL — "كل المدن" is sent as city=__ALL__. */
const homeFeedParams = (params: { city?: string; explicitAll?: boolean }) =>
  params.explicitAll
    ? { city: '__ALL__' }
    : params.city
      ? { city: params.city }
      : undefined;

export const homeFeedApi = {
  /**
   * GET /home/feed — personalised ("مخصص لك"), private, never edge-cached.
   * For signed-in users only.
   */
  get: (params: { city?: string; explicitAll?: boolean } = {}) =>
    apiClient.get<ApiResponse<HomeFeedPayload>>('/home/feed', {
      // FIX HOME-CITY-EXPLICIT-ALL: when the user chose "كل المدن", send
      // city=__ALL__ explicitly. Omitting the param would be interpreted
      // by the backend as "no preference" → profile-city fallback.
      params: homeFeedParams(params),
    }),

  /**
   * GET /home/static — the guest homepage: same payload shape, identical for every
   * anonymous visitor, so it is public + edge-cacheable (Cloudflare HIT for the
   * ~90% of visitors who are not signed in). Never send it an identity.
   */
  getStatic: (params: { city?: string; explicitAll?: boolean } = {}) =>
    apiClient.get<ApiResponse<HomeFeedPayload>>('/home/static', {
      params: homeFeedParams(params),
    }),
};
