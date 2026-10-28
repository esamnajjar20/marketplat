import { apiRequest } from '@/api/client';
import { readPublicCache, readPublicCacheEntry, writePublicCache } from '@/storage/public-cache';
import { cachePublicImages } from '@/storage/public-image-cache';

/** Public ad-list shape returned by GET /api/v1/ads (description is omitted on list responses). */
export type AdListItem = {
  id: string;
  title: string;
  price: number | string | null;
  images: string[];
  city: string;
  condition?: string | null;
  isNegotiable?: boolean;
  isFeatured?: boolean;
  createdAt?: string;
  category?: { id: string; name?: string; nameAr?: string | null } | null;
  user?: { id: string; name?: string | null; city?: string | null; avatarUrl?: string | null } | null;
};

type ApiEnvelope<T> = {
  success: boolean;
  message?: string;
  data?: T;
  meta?: { pagination?: { page?: number; limit?: number; total?: number; totalPages?: number } };
};

export type AdDetail = AdListItem & {
  description?: string | null;
  status?: string;
  condition?: string | null;
  views?: number;
  createdAt?: string;
  updatedAt?: string;
  sellerProfile?: { verified?: boolean; averageRating?: number | null; totalRatings?: number } | null;
  store?: { id: string; name?: string | null; slug?: string | null; logoUrl?: string | null } | null;
};

export type AdListResult = {
  items: AdListItem[];
  page: number;
  totalPages?: number;
};

type PublicAdsOptions = { page?: number; limit?: number; search?: string; categoryId?: string; city?: string; minPrice?: number; maxPrice?: number; sortBy?: 'createdAt' | 'price' | 'views'; sortOrder?: 'asc' | 'desc' };

export function publicAdsCacheKey(options: PublicAdsOptions = {}): string {
  const params = new URLSearchParams();
  params.set('page', String(options.page ?? 1));
  params.set('limit', String(options.limit ?? 8));
  if (options.search?.trim()) params.set('search', options.search.trim());
  if (options.categoryId) params.set('categoryId', options.categoryId);
  if (options.city?.trim()) params.set('city', options.city.trim());
  if (options.minPrice !== undefined) params.set('minPrice', String(options.minPrice));
  if (options.maxPrice !== undefined) params.set('maxPrice', String(options.maxPrice));
  if (options.sortBy) params.set('sortBy', options.sortBy);
  if (options.sortOrder) params.set('sortOrder', options.sortOrder);
  return `ads:${params.toString()}`;
}

/** Read previously saved results without waiting for the network. */
export async function getCachedPublicAds(options: PublicAdsOptions = {}): Promise<AdListResult | null> {
  const cached = await readPublicCache<AdListResult>(publicAdsCacheKey(options));
  return cached && Array.isArray(cached.items) ? cached : null;
}

/** Includes the durable save time so the UI can distinguish local data from a fresh sync. */
export async function getCachedPublicAdsWithMetadata(options: PublicAdsOptions = {}): Promise<{ result: AdListResult; savedAt: number } | null> {
  const entry = await readPublicCacheEntry<AdListResult>(publicAdsCacheKey(options));
  if (!entry || !entry.value || !Array.isArray(entry.value.items)) return null;
  return { result: entry.value, savedAt: entry.savedAt };
}

/** Reads the existing backend route; does not create or alter any backend endpoint. */
export async function fetchPublicAds(options: PublicAdsOptions = {}): Promise<AdListResult> {
  const params = new URLSearchParams();
  params.set('page', String(options.page ?? 1));
  params.set('limit', String(options.limit ?? 8));
  if (options.search?.trim()) params.set('search', options.search.trim());
  if (options.categoryId) params.set('categoryId', options.categoryId);
  if (options.city?.trim()) params.set('city', options.city.trim());
  if (options.minPrice !== undefined) params.set('minPrice', String(options.minPrice));
  if (options.maxPrice !== undefined) params.set('maxPrice', String(options.maxPrice));
  if (options.sortBy) params.set('sortBy', options.sortBy);
  if (options.sortOrder) params.set('sortOrder', options.sortOrder);

  const cacheKey = publicAdsCacheKey(options);
  let response: ApiEnvelope<AdListItem[]>;
  try {
    response = await apiRequest<ApiEnvelope<AdListItem[]>>(`/api/v1/ads?${params.toString()}`);
  } catch (error) {
    const cached = await readPublicCache<AdListResult>(cacheKey);
    if (cached && Array.isArray(cached.items)) return cached;
    throw error;
  }
  if (!response || response.success !== true || !Array.isArray(response.data)) {
    throw new Error('استجابة الإعلانات من الخادم غير متوقعة.');
  }

  const pagination = response.meta?.pagination;
  const result = {
    items: response.data.filter((item) => Boolean(item && typeof item.id === 'string' && typeof item.title === 'string')),
    page: typeof pagination?.page === 'number' ? pagination.page : (options.page ?? 1),
    totalPages: typeof pagination?.totalPages === 'number' ? pagination.totalPages : undefined,
  };
  // allSettled so a single image-download failure does not break the
  // whole ads list. Failed items fall back to their original URLs.
  const preparedItems = await Promise.allSettled(
    result.items.map(async (item) => ({
      ...item,
      images: await cachePublicImages(item.images.filter((uri) => typeof uri === 'string')),
    })),
  );
  const cachedResult: AdListResult = {
    ...result,
    items: preparedItems.map((r, i) => (r.status === 'fulfilled' ? r.value : result.items[i])),
  };
  await writePublicCache(cacheKey, cachedResult);
  // Return the local-image-backed representation too, so the first online visit
  // immediately primes the UI to use the durable image files where available.
  return cachedResult;
}


/** Read a saved public ad detail without waiting for the network. */
export async function getCachedAdDetail(id: string): Promise<AdDetail | null> {
  const normalizedId = id.trim();
  if (!normalizedId || normalizedId.includes('/')) return null;
  const cached = await readPublicCache<AdDetail>(`ad-detail:${normalizedId}`);
  return cached && cached.id === normalizedId && typeof cached.title === 'string' ? cached : null;
}

/** Reads the existing public detail endpoint GET /api/v1/ads/:id. */
export async function fetchAdDetail(id: string): Promise<AdDetail> {
  const normalizedId = id.trim();
  if (!normalizedId || normalizedId.includes('/')) {
    throw new Error('معرّف الإعلان غير صالح.');
  }
  const cacheKey = `ad-detail:${normalizedId}`;
  let response: ApiEnvelope<AdDetail>;
  try {
    response = await apiRequest<ApiEnvelope<AdDetail>>(`/api/v1/ads/${encodeURIComponent(normalizedId)}`);
  } catch (error) {
    const cached = await readPublicCache<AdDetail>(cacheKey);
    if (cached && cached.id === normalizedId && typeof cached.title === 'string') return cached;
    throw error;
  }
  if (!response || response.success !== true || !response.data || response.data.id !== normalizedId || typeof response.data.title !== 'string') {
    throw new Error('استجابة تفاصيل الإعلان من الخادم غير متوقعة.');
  }
  const cachedDetail: AdDetail = {
    ...response.data,
    images: await cachePublicImages(response.data.images.filter((uri) => typeof uri === 'string')),
  };
  await writePublicCache(cacheKey, cachedDetail);
  // Return the exact representation persisted for offline use so the first online
  // render also benefits from downloaded local images.
  return cachedDetail;
}
