import { apiRequest } from '@/api/client';
import { uploadMobileImagesDirect } from '../media/direct-upload.api';
import { criticalAdEnvelopeResponseSchema } from '@/api/response-schemas';
import { deletePublicCacheEntriesByPrefix, deletePublicCacheEntry } from '@/storage/public-cache';
import type { AdListItem } from './ads.api';

type Envelope<T> = { success: boolean; message?: string; data?: T; meta?: { pagination?: { page?: number; limit?: number; total?: number; totalPages?: number } } };

/** Keep both feature-level offline snapshots and transport-level public GET cache coherent. */
async function invalidateAdCaches(adId?: string): Promise<void> {
  const jobs: Promise<void>[] = [
    deletePublicCacheEntriesByPrefix('ads:'),
    // API transport cache keys include the full GET path, including filters/cursors.
    deletePublicCacheEntriesByPrefix('api-public:/api/v1/ads?'),
    deletePublicCacheEntriesByPrefix('api-public:/api/v1/ads/'),
    deletePublicCacheEntry('api-public:/api/v1/ads'),
  ];
  if (adId?.trim()) jobs.push(deletePublicCacheEntry(`ad-detail:${adId.trim()}`));
  await Promise.all(jobs);
}
export type ManagedAd = AdListItem & { description?: string | null; status?: string };

/** Thrown by updateAd when the fields PATCH succeeded but the image upload failed. */
export class PartialAdUpdateError extends Error {
  readonly partial = true;
  constructor(message: string, readonly updated: ManagedAd) {
    super(message);
    this.name = 'PartialAdUpdateError';
  }
}
export type SelectedAdImage = { uri: string; fileName: string; mimeType: string };
export type AdDraft = {
  images: SelectedAdImage[];
  title: string;
  description: string;
  price: string;
  city: string;
  categoryId: string;
  isNegotiable: boolean;
  condition?: 'NEW' | 'USED' | 'REFURBISHED' | '';
  storeId?: string | null;
};

function requireEnvelopeData<T>(response: Envelope<T>, fallback: string): T {
  if (!response || response.success !== true || response.data === undefined) {
    throw new Error(response?.message || fallback);
  }
  return response.data;
}

export type ManagedAdPage = { items: ManagedAd[]; page: number; totalPages: number; total: number };
export type MyAdStats = { activeAds: number; soldAds: number; totalAds: number; totalViews: number; favoritesCount: number };
export async function fetchMyAdStats(token: string): Promise<MyAdStats> {
  const response = await apiRequest<Envelope<MyAdStats>>('/api/v1/ads/me/stats', { token });
  const data = requireEnvelopeData(response, 'تعذر تحميل إحصاءات الإعلانات.');
  const count = (value: unknown, field: string): number => {
    const parsed = Number(value);
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '') || !Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`قيمة إحصاء الإعلانات غير صالحة: ${field}.`);
    }
    return Math.floor(parsed);
  };
  return {
    activeAds: count(data.activeAds, 'activeAds'),
    soldAds: count(data.soldAds, 'soldAds'),
    totalAds: count(data.totalAds, 'totalAds'),
    totalViews: count(data.totalViews, 'totalViews'),
    favoritesCount: count(data.favoritesCount, 'favoritesCount'),
  };
}
/** Refresh page one without losing previously loaded pages or duplicating rows. */
export function mergeRefreshedAdsPage(
  existing: ManagedAd[],
  refreshedFirstPage: ManagedAd[],
  totalPages: number,
  pageSize = 30,
): ManagedAd[] {
  const firstPageIds = new Set(refreshedFirstPage.map((item) => item.id));
  const merged = [...refreshedFirstPage, ...existing.filter((item) => !firstPageIds.has(item.id))];
  const maxRetained = Math.max(refreshedFirstPage.length, Math.max(0, totalPages) * pageSize);
  return merged.slice(0, maxRetained);
}
export async function fetchMyAdsPage(token: string, page = 1, limit = 30, signal?: AbortSignal): Promise<ManagedAdPage> {
  const response = await apiRequest<Envelope<ManagedAd[]>>(`/api/v1/ads/me?limit=${limit}&page=${page}`, { token, signal });
  const data = requireEnvelopeData(response, 'استجابة إعلاناتك من الخادم غير متوقعة.');
  if (!Array.isArray(data)) throw new Error('قائمة إعلاناتك غير صالحة.');
  const pagination = response.meta?.pagination;
  return { items: data.filter((ad) => ad && typeof ad.id === 'string'), page: pagination?.page ?? page, totalPages: pagination?.totalPages ?? (data.length >= limit ? page + 1 : page), total: pagination?.total ?? data.length };
}
export async function fetchMyAds(token: string): Promise<ManagedAd[]> {
  const collected: ManagedAd[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 100; page += 1) {
    const result = await fetchMyAdsPage(token, page, 100);
    for (const ad of result.items) if (!seen.has(ad.id)) { seen.add(ad.id); collected.push(ad); }
    if (page >= result.totalPages || result.items.length < 100) break;
  }
  return collected;
}

export async function createAd(draft: AdDraft, token: string, csrfToken?: string | null, offlineOperationId?: string): Promise<ManagedAd> {
  const directImagePublicIds = await uploadMobileImagesDirect(draft.images, 'ads', token, csrfToken);
  const body = {
    title: draft.title.trim(),
    description: draft.description.trim(),
    city: draft.city.trim(),
    ...(draft.price.trim() ? { price: draft.price.trim() } : {}),
    ...(draft.categoryId.trim() ? { categoryId: draft.categoryId.trim() } : {}),
    isNegotiable: draft.isNegotiable,
    ...(draft.condition ? { condition: draft.condition } : {}),
    ...(draft.storeId ? { storeId: draft.storeId } : {}),
    directImagePublicIds,
  };
  const response = await apiRequest<Envelope<ManagedAd>>('/api/v1/ads', {
    method: 'POST', body: JSON.stringify(body), token, headers: {
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(offlineOperationId ? { 'X-Offline-Op-Id': offlineOperationId } : {}),
    },
    responseSchema: criticalAdEnvelopeResponseSchema as unknown as import('zod').ZodType<Envelope<ManagedAd>>,
  });
  const created = requireEnvelopeData(response, 'تعذر إنشاء الإعلان.');
  await invalidateAdCaches(created.id);
  return created;
}

export async function updateAd(id: string, draft: AdDraft, token: string, csrfToken?: string | null): Promise<ManagedAd> {
  const payload = {
    title: draft.title.trim(), description: draft.description.trim(), city: draft.city.trim(),
    price: draft.price.trim() ? Number(draft.price) : null,
    categoryId: draft.categoryId.trim() || null,
    isNegotiable: draft.isNegotiable,
    condition: draft.condition || null,
  };
  const response = await apiRequest<Envelope<ManagedAd>>(`/api/v1/ads/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(payload), token,
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    responseSchema: criticalAdEnvelopeResponseSchema as unknown as import('zod').ZodType<Envelope<ManagedAd>>,
  });
  const updated = requireEnvelopeData(response, 'تعذر تحديث الإعلان.');
  // The fields PATCH has already succeeded, even if the subsequent image upload fails.
  await invalidateAdCaches(id);
  if (draft.images.length) {
    try {
      const directImagePublicIds = await uploadMobileImagesDirect(draft.images, 'ads', token, csrfToken);
      const imageResponse = await apiRequest<Envelope<ManagedAd>>(`/api/v1/ads/${encodeURIComponent(id)}/images`, {
        method: 'POST', body: JSON.stringify({ directImagePublicIds }), token,
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
        responseSchema: criticalAdEnvelopeResponseSchema as unknown as import('zod').ZodType<Envelope<ManagedAd>>,
      });
      const imageUpdated = requireEnvelopeData(imageResponse, 'تم تحديث البيانات لكن تعذّر رفع الصور. افتح التعديل مجددًا للتحقق من الإعلان.');
      await invalidateAdCaches(id);
      return imageUpdated;
    } catch (error) {
      throw new PartialAdUpdateError(
        error instanceof Error ? error.message : 'تم تحديث البيانات لكن تعذّر رفع الصور.',
        updated,
      );
    }
  }
  return updated;
}

export async function deleteAd(id: string, token: string, csrfToken?: string | null): Promise<void> {
  await apiRequest<Envelope<unknown>>(`/api/v1/ads/${encodeURIComponent(id)}`, {
    method: 'DELETE', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
  });
  await invalidateAdCaches(id);
}


/** Remove one existing image. The backend enforces ownership and keeps at least one image. */
export async function removeAdImage(id: string, imageUrl: string, token: string, csrfToken?: string | null): Promise<ManagedAd> {
  if (!id.trim() || !/^https?:\/\//i.test(imageUrl)) throw new Error('بيانات الصورة غير صالحة.');
  const response = await apiRequest<Envelope<ManagedAd>>(`/api/v1/ads/${encodeURIComponent(id)}/images`, {
    method: 'DELETE', token, body: JSON.stringify({ imageUrl }),
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
  });
  const updated = requireEnvelopeData(response, 'تعذر حذف الصورة.');
  await invalidateAdCaches(id);
  return updated;
}

/** Reorder the complete current image URL set; the backend rejects missing/foreign URLs. */
export async function reorderAdImages(id: string, images: string[], token: string, csrfToken?: string | null): Promise<ManagedAd> {
  if (!id.trim() || images.length < 1 || images.some((url) => !/^https?:\/\//i.test(url))) throw new Error('ترتيب الصور غير صالح.');
  const response = await apiRequest<Envelope<ManagedAd>>(`/api/v1/ads/${encodeURIComponent(id)}/images/reorder`, {
    method: 'PUT', token, body: JSON.stringify({ images }),
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
  });
  const updated = requireEnvelopeData(response, 'تعذر حفظ ترتيب الصور.');
  await invalidateAdCaches(id);
  return updated;
}
