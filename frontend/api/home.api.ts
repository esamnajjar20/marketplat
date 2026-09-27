/**
 * Home API — maps to backend GET /api/v1/home.
 *
 * Aggregates the above-the-fold public homepage sections
 * (FeaturedCarousel, CategoriesRow, HomeAboveFold's city/general ads)
 * that used to fire as 8-9 separate requests. See
 * backend/src/modules/home/home.validation.ts for exactly what is —
 * and, just as deliberately, isn't — included.
 */
import { apiClient } from './client';
import type { ApiResponse, PaginationMeta } from '@/types/api.types';
import type { AdListItem } from '@/types/ad.types';
import type { StoreWithSeller } from '@/types/store.types';
import type { ServiceListingWithProvider } from '@/types/service.types';
import type { Category } from '@/types/category.types';
import type { ProductCategory } from '@/types/product.types';
import type { ServiceCategory } from '@/types/service.types';

interface Page<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface HomepagePayload {
  featuredCarousel: {
    ads: Page<AdListItem>;
    adsFallback: Page<AdListItem> | null;
    stores: Page<StoreWithSeller>;
    services: Page<ServiceListingWithProvider>;
  };
  categories: {
    ads: Category[];
    products: ProductCategory[];
    services: ServiceCategory[];
  };
  adsForHome: {
    general: Page<AdListItem>;
    city: Page<AdListItem> | null;
  };
}

export const homeApi = {
  /** GET /home?city= — city omitted unless already resolved client-side */
  getHomepage: (city?: string) =>
    apiClient.get<ApiResponse<HomepagePayload>>('/home', { params: city ? { city } : undefined }),
};
