import { ApiError, apiRequest } from '@/api/client';
import { deletePublicCacheEntry, readPublicCache, readPublicCacheEntry, writePublicCache } from '@/storage/public-cache';
import {
  cachePublicImages,
  prunePublicImageCache,
  prunePublicImageCacheIfNeeded,
} from '@/storage/public-image-cache';
import { canUseStaleCacheAfterReadFailure } from '@/lib/offline-cache-policy';
import {
  applyCachedPublicAdImages,
  getPublicAdImageCacheCandidates,
  schedulePublicAdImageCaching,
} from './public-ad-image-cache';

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
  total?: number;
};

type PublicAdsOptions = { page?: number; limit?: number; search?: string; categoryId?: string; storeId?: string; city?: string; minPrice?: number; maxPrice?: number; condition?: 'NEW' | 'USED' | 'REFURBISHED'; sortBy?: 'createdAt' | 'price' | 'views'; sortOrder?: 'asc' | 'desc'; signal?: AbortSignal };

export function publicAdsCacheKey(options: PublicAdsOptions = {}): string {
  const params = new URLSearchParams();
  params.set('page', String(options.page ?? 1));
  params.set('limit', String(options.limit ?? 8));
  if (options.search?.trim()) params.set('search', options.search.trim());
  if (options.categoryId) params.set('categoryId', options.categoryId);
  if (options.storeId) params.set('storeId', options.storeId);
  if (options.condition) params.set('condition', options.condition);
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
  if (options.storeId) params.set('storeId', options.storeId);
  if (options.condition) params.set('condition', options.condition);
  if (options.city?.trim()) params.set('city', options.city.trim());
  if (options.minPrice !== undefined) params.set('minPrice', String(options.minPrice));
  if (options.maxPrice !== undefined) params.set('maxPrice', String(options.maxPrice));
  if (options.sortBy) params.set('sortBy', options.sortBy);
  if (options.sortOrder) params.set('sortOrder', options.sortOrder);

  const cacheKey = publicAdsCacheKey(options);
  let response: ApiEnvelope<AdListItem[]>;
  try {
    response = await apiRequest<ApiEnvelope<AdListItem[]>>(`/api/v1/ads?${params.toString()}`, { signal: options.signal });
  } catch (error) {
    if (!canUseStaleCacheAfterReadFailure(error, options.signal)) throw error;
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
    total: typeof pagination?.total === 'number' ? pagination.total : response.data.length,
  };
  // Persist and return the API page immediately. Image downloads and cache
  // pruning are opportunistic background work: neither may delay list rendering
  // or load-more pagination on a slow connection.
  await writePublicCache(cacheKey, result);
  schedulePublicAdImageCaching(() => cachePublicAdListImagesInBackground(cacheKey, result));
  return result;
}

/** Cache list-sized images after the API result is already available to the UI. */
async function cachePublicAdListImagesInBackground(cacheKey: string, snapshot: AdListResult): Promise<void> {
  const candidates = getPublicAdImageCacheCandidates(snapshot.items);
  if (candidates.length === 0) return;

  const cachedUris = await cachePublicImages(candidates.map((candidate) => candidate.cacheUri));
  const current = await readPublicCache<AdListResult>(cacheKey);
  if (!current || !Array.isArray(current.items)) return;

  const updatedItems = applyCachedPublicAdImages(current.items, candidates, cachedUris);
  const changed = updatedItems.some((item, itemIndex) =>
    item.images.some((uri, imageIndex) => uri !== current.items[itemIndex]?.images[imageIndex]),
  );
  if (changed) {
    // Preserve any newer metadata/page contents written while image downloads ran.
    await writePublicCache(cacheKey, { ...current, items: updatedItems });
  }

  // Pruning runs only after local image references have been persisted, and
  // outside the fetchPublicAds critical path.
  if (cachedUris.some((uri) => typeof uri === 'string' && uri.startsWith('file://'))) {
    await prunePublicImageCacheIfNeeded();
  }
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
    if (error instanceof ApiError && error.code === 'PUBLIC_ACCOUNT_BLOCKED') {
      await Promise.all([
        deletePublicCacheEntry(cacheKey),
        deletePublicCacheEntry(`/api/v1/ads/${encodeURIComponent(normalizedId)}`),
      ]);
      throw error;
    }
    if (!canUseStaleCacheAfterReadFailure(error)) throw error;
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
  await prunePublicImageCache();
  // Return the exact representation persisted for offline use so the first online
  // render also benefits from downloaded local images.
  return cachedDetail;
}
