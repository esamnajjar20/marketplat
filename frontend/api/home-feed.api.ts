import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { AdListItem } from '@/types/ad.types';
import type { ProductCategory, ProductWithStore } from '@/types/product.types';
import type { Category } from '@/types/category.types';
import type { ServiceCategory, ServiceListingWithProvider, ServiceProviderDetails } from '@/types/service.types';
import type { StoreType, StoreWithSeller } from '@/types/store.types';
import type { HomepageLocationSource } from './home.api';

export interface HomeFeedPayload {
  meta: {
    city: string | null;
    citySource: 'browse' | 'profile' | 'none';
    personalized: boolean;
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

export const homeFeedQueryKey = (city: string | undefined, userId: string | null) => [
  'home',
  'feed',
  city ?? null,
  userId ?? 'guest',
] as const;

export const homeFeedApi = {
  get: (city?: string) =>
    apiClient.get<ApiResponse<HomeFeedPayload>>('/home/feed', {
      params: city ? { city } : undefined,
    }),
};
