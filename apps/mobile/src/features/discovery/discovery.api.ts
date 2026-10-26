import { apiRequest } from '@/api/client';

type Envelope<T> = { success: boolean; message?: string; data?: T; meta?: { pagination?: { page?: number; totalPages?: number; total?: number } } };

export type SearchResult = {
  id: string; type: 'ad' | 'product' | 'store' | 'service'; title: string; description: string;
  image: string | null; city: string | null; rating: number; views: number; price: string | null;
  seller: { id: string; name: string; verified: boolean; type: string };
  url: string; createdAt: string;
};
export type SearchOptions = {
  q?: string; type?: 'all' | 'ads' | 'products' | 'stores' | 'services'; categoryId?: string;
  city?: string; minPrice?: number; maxPrice?: number;
  sort?: 'relevance' | 'rating' | 'newest' | 'views' | 'price_asc' | 'price_desc'; page?: number; limit?: number;
};
export async function searchMarketplace(options: SearchOptions) {
  const params = new URLSearchParams({ type: options.type ?? 'all', sort: options.sort ?? 'relevance', page: String(options.page ?? 1), limit: String(options.limit ?? 20) });
  if (options.q?.trim()) params.set('q', options.q.trim());
  if (options.categoryId) params.set('categoryId', options.categoryId);
  if (options.city?.trim()) params.set('city', options.city.trim());
  if (options.minPrice !== undefined) params.set('minPrice', String(options.minPrice));
  if (options.maxPrice !== undefined) params.set('maxPrice', String(options.maxPrice));
  const response = await apiRequest<Envelope<SearchResult[]>>(`/api/v1/search?${params.toString()}`);
  if (response?.success !== true || !Array.isArray(response.data)) throw new Error(response?.message || 'استجابة البحث غير صالحة.');
  return { items: response.data, page: response.meta?.pagination?.page ?? options.page ?? 1, totalPages: response.meta?.pagination?.totalPages ?? 1, total: response.meta?.pagination?.total ?? response.data.length };
}

export type RankedSeller = {
  rank: number; medal: 'gold' | 'silver' | 'bronze' | null; sellerProfileId: string; userId: string;
  displayName: string; avatarUrl?: string | null; city?: string | null; verified: boolean; trustScore: number;
  averageRating: number; totalRatings: number; responseTimeMinutes?: number | null; responseRate?: number | null;
  activeAds: number; score: number;
};
export async function fetchSellerRanking(limit = 30): Promise<RankedSeller[]> {
  const response = await apiRequest<Envelope<RankedSeller[]>>(`/api/v1/sellers/ranking?limit=${Math.max(1, Math.min(50, Math.floor(limit)))}`);
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
  const response = await apiRequest<Envelope<MixedRecommendations>>(`/api/v1/recommendations?type=mixed&limit=${Math.max(1, Math.min(24, Math.floor(limit)))}`, token ? { token } : {});
  if (response?.success !== true || !response.data || typeof response.data !== 'object') throw new Error(response?.message || 'تعذر تحميل الاقتراحات.');
  return { ads: Array.isArray(response.data.ads) ? response.data.ads : [], products: Array.isArray(response.data.products) ? response.data.products : [], services: Array.isArray(response.data.services) ? response.data.services : [] };
}
