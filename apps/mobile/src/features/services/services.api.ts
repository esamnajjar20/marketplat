import { cacheOfflineCreationReferenceData, readOfflineCreationReferenceData } from '@/storage/entity-create-outbox';
import { apiRequest } from '@/api/client';
import { readPublicCache, writePublicCache } from '@/storage/public-cache';

type Envelope<T> = { success: boolean; message?: string; data?: T; meta?: { pagination?: { page?: number; limit?: number; total?: number; totalPages?: number } } };
export type ServiceListing = {
  id: string; title: string; description?: string | null; images?: string[];
  pricingType?: 'FIXED' | 'STARTING_FROM' | 'NEGOTIABLE' | string; price?: number | string | null;
  durationEstimate?: string | null; serviceLocation?: 'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE' | string;
  status?: string; createdAt?: string;
  provider?: { id?: string; businessName?: string | null; logoUrl?: string | null; availabilityStatus?: string; sellerProfile?: { displayName?: string | null; verified?: boolean; averageRating?: number | null } | null };
  category?: { id?: string; name?: string; nameAr?: string | null } | null;
};
export type ServiceRequest = {
  id: string; listingId?: string; details?: string; status?: string; quotedPrice?: number | string | null; agreedPrice?: number | string | null; createdAt?: string;
  listing?: { id?: string; title?: string } | null; customer?: { name?: string; displayName?: string } | null;
  provider?: { businessName?: string; sellerProfile?: { displayName?: string | null } } | null;
};
function readData<T>(response: Envelope<T>, fallback: string): T {
  if (!response || response.success !== true || response.data === undefined) throw new Error(response?.message || fallback);
  return response.data;
}
export function serviceListingsCacheKey(options: { page?: number; limit?: number; search?: string } = {}): string {
  const params = new URLSearchParams({ page: String(options.page ?? 1), limit: String(options.limit ?? 20), sortBy: 'createdAt', sortOrder: 'desc' });
  if (options.search?.trim()) params.set('search', options.search.trim());
  return `service-listings:${params.toString()}`;
}
export async function getCachedServiceListings(options: { page?: number; limit?: number; search?: string } = {}): Promise<ServiceListing[] | null> {
  const cached = await readPublicCache<ServiceListing[]>(serviceListingsCacheKey(options));
  return Array.isArray(cached) ? cached : null;
}
export async function fetchServiceListings(options: { page?: number; limit?: number; search?: string } = {}): Promise<ServiceListing[]> {
  const params = new URLSearchParams({ page: String(options.page ?? 1), limit: String(options.limit ?? 20), sortBy: 'createdAt', sortOrder: 'desc' });
  if (options.search?.trim()) params.set('search', options.search.trim());
  const cacheKey = serviceListingsCacheKey(options);
  let response: Envelope<ServiceListing[]>;
  try { response = await apiRequest<Envelope<ServiceListing[]>>(`/api/v1/service-listings?${params.toString()}`); }
  catch (error) { const cached = await getCachedServiceListings(options); if (cached) return cached; throw error; }
  const items = readData(response, 'تعذر تحميل الخدمات.');
  if (!Array.isArray(items)) throw new Error('استجابة قائمة الخدمات غير صالحة.');
  const valid = items.filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string');
  await writePublicCache(cacheKey, valid);
  return valid;
}
export async function getCachedServiceListing(id: string): Promise<ServiceListing | null> {
  const item = await readPublicCache<ServiceListing>(`service-listing:${id}`);
  return item?.id === id ? item : null;
}
export async function fetchServiceListing(id: string): Promise<ServiceListing> {
  let response: Envelope<ServiceListing>;
  try { response = await apiRequest<Envelope<ServiceListing>>(`/api/v1/service-listings/${encodeURIComponent(id)}`); }
  catch (error) { const cached = await getCachedServiceListing(id); if (cached) return cached; throw error; }
  const item = readData(response, 'تعذر تحميل تفاصيل الخدمة.');
  if (!item || item.id !== id) throw new Error('استجابة تفاصيل الخدمة غير صالحة.');
  await writePublicCache(`service-listing:${id}`, item);
  return item;
}
export async function fetchServiceRequests(token: string, incoming = false): Promise<ServiceRequest[]> {
  const response = await apiRequest<Envelope<ServiceRequest[]>>(`/api/v1/service-requests/${incoming ? 'incoming' : 'me'}?page=1&limit=50`, { token });
  const items = readData(response, 'تعذر تحميل طلبات الخدمات.');
  if (!Array.isArray(items)) throw new Error('استجابة الطلبات غير صالحة.');
  return items;
}
export async function createServiceRequest(listingId: string, details: string, token: string, csrfToken?: string | null): Promise<ServiceRequest> {
  const response = await apiRequest<Envelope<ServiceRequest>>('/api/v1/service-requests', {
    method: 'POST', token, body: JSON.stringify({ listingId, details: details.trim() }),
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
  });
  return readData(response, 'تعذر إرسال طلب الخدمة.');
}

export async function respondToServiceRequest(id: string, action: 'ACCEPTED' | 'REJECTED', token: string, csrfToken?: string | null): Promise<ServiceRequest> {
  const response = await apiRequest<Envelope<ServiceRequest>>(`/api/v1/service-requests/${encodeURIComponent(id)}/respond`, {
    method: 'PATCH', token, body: JSON.stringify({ action }),
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
  });
  return readData(response, 'تعذر تحديث حالة الطلب.');
}

export type ServiceCategoryOption = { id: string; name: string; nameAr?: string | null; serviceTypeId?: string | null; isActive?: boolean };
export async function fetchServiceCategoryOptions(): Promise<ServiceCategoryOption[]> {
  try {
    const response = await apiRequest<Envelope<ServiceCategoryOption[]>>('/api/v1/service-categories');
    const items = readData(response, 'تعذر تحميل تصنيفات الخدمات.');
    if (!Array.isArray(items)) throw new Error('استجابة تصنيفات الخدمات غير صالحة.');
    const filtered = items.filter((item) => item && typeof item.id === 'string' && item.isActive !== false);
    await cacheOfflineCreationReferenceData('service-categories', filtered).catch(() => undefined);
    return filtered;
  } catch (error) {
    const cached = await readOfflineCreationReferenceData<ServiceCategoryOption[]>('service-categories').catch(() => null);
    if (Array.isArray(cached) && cached.length) return cached.filter((item) => item && typeof item.id === 'string' && item.isActive !== false);
    throw error;
  }
}
export async function fetchMyServiceListings(token: string): Promise<ServiceListing[]> {
  const response = await apiRequest<Envelope<ServiceListing[]>>('/api/v1/service-listings/me?page=1&limit=50&sortBy=createdAt&sortOrder=desc', { token });
  const items = readData(response, 'تعذر تحميل خدماتك.');
  if (!Array.isArray(items)) throw new Error('استجابة خدماتك غير صالحة.');
  return items;
}
export async function createMyServiceListing(input: { categoryId: string; title: string; description: string; pricingType: 'FIXED'|'STARTING_FROM'|'NEGOTIABLE'; price?: number; durationEstimate?: string; serviceLocation: 'AT_CUSTOMER'|'AT_PROVIDER'|'REMOTE' }, token: string, csrfToken?: string | null, offlineOperationId?: string, images: Array<{uri:string;fileName:string;mimeType:string}> = []): Promise<ServiceListing> {
  const headers = { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...(offlineOperationId ? { 'X-Offline-Op-Id': offlineOperationId } : {}) };
  let body: FormData | string = JSON.stringify(input);
  if (images.length) { const form = new FormData(); for (const [key,value] of Object.entries(input)) if (value !== undefined) form.append(key, typeof value === 'string' ? value : String(value)); for (const image of images) form.append('images', {uri:image.uri,name:image.fileName,type:image.mimeType} as unknown as Blob); body = form; }
  const response = await apiRequest<Envelope<ServiceListing>>('/api/v1/service-listings', { method: 'POST', token, headers, body });
  return readData(response, 'تعذر إنشاء الخدمة.');
}
export async function updateMyServiceListing(id: string, input: Partial<{ categoryId: string; title: string; description: string; pricingType: 'FIXED'|'STARTING_FROM'|'NEGOTIABLE'; price: number|null; durationEstimate: string|null; serviceLocation: 'AT_CUSTOMER'|'AT_PROVIDER'|'REMOTE'; status: 'ACTIVE'|'PAUSED' }>, token: string, csrfToken?: string | null): Promise<ServiceListing> {
  const response = await apiRequest<Envelope<ServiceListing>>(`/api/v1/service-listings/${encodeURIComponent(id)}`, { method: 'PATCH', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify(input) });
  return readData(response, 'تعذر تحديث الخدمة.');
}
export async function deleteMyServiceListing(id: string, token: string, csrfToken?: string | null): Promise<void> {
  const response = await apiRequest<Envelope<unknown>>(`/api/v1/service-listings/${encodeURIComponent(id)}`, { method: 'DELETE', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify({}) });
  if (!response || response.success !== true) throw new Error(response?.message || 'تعذر حذف الخدمة.');
}
