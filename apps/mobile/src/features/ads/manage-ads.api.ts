import { apiRequest } from '@/api/client';
import type { AdListItem } from './ads.api';

type Envelope<T> = { success: boolean; message?: string; data?: T; meta?: { pagination?: { page?: number; limit?: number; total?: number; totalPages?: number } } };
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
};

function requireEnvelopeData<T>(response: Envelope<T>, fallback: string): T {
  if (!response || response.success !== true || response.data === undefined) {
    throw new Error(response?.message || fallback);
  }
  return response.data;
}

export async function fetchMyAds(token: string): Promise<ManagedAd[]> {
  const collected: ManagedAd[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= 100; page += 1) {
    const response = await apiRequest<Envelope<ManagedAd[]>>(`/api/v1/ads/me?limit=100&page=${page}`, { token });
    const data = requireEnvelopeData(response, 'استجابة إعلاناتك من الخادم غير متوقعة.');
    if (!Array.isArray(data)) throw new Error('قائمة إعلاناتك غير صالحة.');
    for (const ad of data) {
      if (ad && typeof ad.id === 'string' && !seen.has(ad.id)) { seen.add(ad.id); collected.push(ad); }
    }
    const tp = response.meta?.pagination?.totalPages;
    if (typeof tp === 'number') { if (page >= tp) break; } else if (data.length < 100) { break; }
  }
  return collected;
}

export async function createAd(draft: AdDraft, token: string, csrfToken?: string | null): Promise<ManagedAd> {
  const body = new FormData();
  for (const image of draft.images) {
    body.append('images', { uri: image.uri, name: image.fileName, type: image.mimeType } as unknown as Blob);
  }
  body.append('title', draft.title.trim());
  body.append('description', draft.description.trim());
  body.append('city', draft.city.trim());
  if (draft.price.trim()) body.append('price', draft.price.trim());
  if (draft.categoryId.trim()) body.append('categoryId', draft.categoryId.trim());
  body.append('isNegotiable', String(draft.isNegotiable));
  const response = await apiRequest<Envelope<ManagedAd>>('/api/v1/ads', {
    method: 'POST', body, token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
  });
  return requireEnvelopeData(response, 'تعذر إنشاء الإعلان.');
}

export async function updateAd(id: string, draft: AdDraft, token: string, csrfToken?: string | null): Promise<ManagedAd> {
  const payload = {
    title: draft.title.trim(), description: draft.description.trim(), city: draft.city.trim(),
    price: draft.price.trim() ? Number(draft.price) : null,
    categoryId: draft.categoryId.trim() || null,
    isNegotiable: draft.isNegotiable,
  };
  const response = await apiRequest<Envelope<ManagedAd>>(`/api/v1/ads/${encodeURIComponent(id)}`, {
    method: 'PATCH', body: JSON.stringify(payload), token,
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
  });
  const updated = requireEnvelopeData(response, 'تعذر تحديث الإعلان.');
  if (draft.images.length) {
    const form = new FormData();
    for (const image of draft.images) {
      form.append('images', { uri: image.uri, name: image.fileName, type: image.mimeType } as unknown as Blob);
    }
    const imageResponse = await apiRequest<Envelope<ManagedAd>>(`/api/v1/ads/${encodeURIComponent(id)}/images`, {
      method: 'POST', body: form, token,
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    });
    try {
      return requireEnvelopeData(imageResponse, 'تم تحديث البيانات لكن تعذّر رفع الصور. افتح التعديل مجددًا للتحقق من الإعلان.');
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
}


/** Remove one existing image. The backend enforces ownership and keeps at least one image. */
export async function removeAdImage(id: string, imageUrl: string, token: string, csrfToken?: string | null): Promise<ManagedAd> {
  if (!id.trim() || !/^https?:\/\//i.test(imageUrl)) throw new Error('بيانات الصورة غير صالحة.');
  const response = await apiRequest<Envelope<ManagedAd>>(`/api/v1/ads/${encodeURIComponent(id)}/images`, {
    method: 'DELETE', token, body: JSON.stringify({ imageUrl }),
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
  });
  return requireEnvelopeData(response, 'تعذر حذف الصورة.');
}

/** Reorder the complete current image URL set; the backend rejects missing/foreign URLs. */
export async function reorderAdImages(id: string, images: string[], token: string, csrfToken?: string | null): Promise<ManagedAd> {
  if (!id.trim() || images.length < 1 || images.some((url) => !/^https?:\/\//i.test(url))) throw new Error('ترتيب الصور غير صالح.');
  const response = await apiRequest<Envelope<ManagedAd>>(`/api/v1/ads/${encodeURIComponent(id)}/images/reorder`, {
    method: 'PUT', token, body: JSON.stringify({ images }),
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
  });
  return requireEnvelopeData(response, 'تعذر حفظ ترتيب الصور.');
}
