import { apiRequest } from '@/api/client';
import { buildFilterParams } from '../../../../../shared/filters';

type Envelope<T> = { success: boolean; message?: string; data?: T; meta?: { pagination?: { page?: number; totalPages?: number; total?: number } } };

export type SearchResult = {
  id: string; type: 'ad' | 'product' | 'store' | 'service'; title: string; description: string;
  image: string | null; city: string | null; rating: number; views: number; price: string | null;
  seller: { id: string; name: string; verified: boolean; type: string };
  url: string; createdAt: string;
};
export type SearchOptions = {
  q?: string; type?: 'all' | 'ads' | 'products' | 'stores' | 'services'; categoryId?: string;
  city?: string; minPrice?: number; maxPrice?: number; condition?: 'NEW' | 'USED' | 'REFURBISHED';
  sort?: 'relevance' | 'rating' | 'newest' | 'views' | 'price_asc' | 'price_desc'; page?: number; limit?: number; signal?: AbortSignal;
};
export async function searchMarketplace(options: SearchOptions) {
  const params = buildFilterParams({
    type: options.type ?? 'all',
    sort: options.sort ?? 'relevance',
    page: options.page ?? 1,
    limit: options.limit ?? 20,
    q: options.q,
    categoryId: options.categoryId,
    city: options.city,
    minPrice: options.minPrice,
    maxPrice: options.maxPrice,
    condition: options.condition && (options.type === 'all' || options.type === 'ads' || !options.type)
      ? options.condition
      : undefined,
  }, { profile: 'globalSearch' });
  const response = await apiRequest<Envelope<SearchResult[]>>(`/api/v1/search?${params.toString()}`, options.signal ? { signal: options.signal } : {});
  if (response?.success !== true || !Array.isArray(response.data)) throw new Error(response?.message || 'استجابة البحث غير صالحة.');
  return { items: response.data, page: response.meta?.pagination?.page ?? options.page ?? 1, totalPages: response.meta?.pagination?.totalPages ?? 1, total: response.meta?.pagination?.total ?? response.data.length };
}

export type RankedSeller = {
  rank: number; medal: 'gold' | 'silver' | 'bronze' | null; sellerProfileId: string; userId: string;
  displayName: string; avatarUrl?: string | null; city?: string | null; verified: boolean; trustScore: number;
  averageRating: number; totalRatings: number; responseTimeMinutes?: number | null; responseRate?: number | null;
  activeAds: number; score: number;
};
export async function fetchSellerRanking(limit = 30, signal?: AbortSignal): Promise<RankedSeller[]> {
  const params = buildFilterParams({ limit: Math.max(1, Math.min(50, Math.floor(limit))) }, { profile: 'sellerRanking' });
  const response = await apiRequest<Envelope<RankedSeller[]>>(`/api/v1/sellers/ranking?${params.toString()}`, { signal });
  if (response?.success !== true || !Array.isArray(response.data)) throw new Error(response?.message || 'تعذر تحميل ترتيب البائعين.');
  return response.data;
}

export type RecommendationItem = {
  id: string; title?: string; name?: string; description?: string | null; price?: string | number | null;
  images?: string[]; image?: string | null; city?: string | null; user?: { name?: string | null } | null;
  store?: { id?: string; name?: string | null } | null; provider?: { id?: string; displayName?: string | null; user?: { name?: string | null } } | null;
  category?: { name?: string; nameAr?: string | null } | null;
};
export type MixedRecommendations = { ads: RecommendationItem[] | null; products: RecommendationItem[] | null; services: RecommendationItem[] | null };
export async function fetchMixedRecommendations(limit = 12, token?: string | null): Promise<MixedRecommendations> {
  const response = await apiRequest<Envelope<MixedRecommendations>>(`/api/v1/recommendations?${buildFilterParams({ type: 'mixed', limit: Math.max(1, Math.min(24, Math.floor(limit))) }, { profile: 'recommendations' })}`, token ? { token } : {});
  if (response?.success !== true || !response.data || typeof response.data !== 'object') throw new Error(response?.message || 'تعذر تحميل الاقتراحات.');
  return { ads: Array.isArray(response.data.ads) ? response.data.ads : [], products: Array.isArray(response.data.products) ? response.data.products : [], services: Array.isArray(response.data.services) ? response.data.services : [] };
}
