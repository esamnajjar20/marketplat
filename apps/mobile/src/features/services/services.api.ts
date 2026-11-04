import { cacheOfflineCreationReferenceData, readOfflineCreationReferenceData } from '@/storage/entity-create-outbox';
import { apiRequest } from '@/api/client';
import { deletePublicCacheEntriesByPrefix, deletePublicCacheEntry, readPublicCache, writePublicCache } from '@/storage/public-cache';
import { canUseStaleCacheAfterReadFailure } from '@/lib/offline-cache-policy';

type Envelope<T> = { success: boolean; message?: string; data?: T; meta?: { pagination?: { page?: number; limit?: number; total?: number; totalPages?: number } } };
export type ServiceListing = {
  id: string; title: string; description?: string | null; images?: string[];
  pricingType?: 'FIXED' | 'STARTING_FROM' | 'NEGOTIABLE' | string; price?: number | string | null;
  durationEstimate?: string | null; serviceLocation?: 'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE' | string;
  status?: string; createdAt?: string;
  provider?: { id?: string; businessName?: string | null; logoUrl?: string | null; availabilityStatus?: string; sellerProfile?: { id?: string; userId?: string; displayName?: string | null; verified?: boolean; averageRating?: number | null; totalRatings?: number } | null };
  category?: { id?: string; name?: string; nameAr?: string | null } | null;
};
export type ServiceRequest = {
  id: string; listingId?: string; customerId?: string; details?: string; attachedImages?: string[]; status?: string; quotedPrice?: number | string | null; agreedPrice?: number | string | null; createdAt?: string; updatedAt?: string; respondedAt?: string | null; disputeReason?: string | null;
  appointment?: { id?: string; scheduledStart?: string; scheduledEnd?: string; status?: string; notes?: string | null } | null;
  listing?: { id?: string; title?: string; description?: string | null; images?: string[]; price?: number | string | null; pricingType?: string; durationEstimate?: string | null; serviceType?: { capabilities?: Record<string, unknown> | null } | null; provider?: { id?: string; businessName?: string | null; sellerProfile?: { id?: string; userId?: string; displayName?: string | null } | null } | null } | null; customer?: { id?: string; name?: string; displayName?: string; avatarUrl?: string | null } | null;
  provider?: { businessName?: string; sellerProfile?: { id?: string; userId?: string; displayName?: string | null } } | null;
};

/** Keep all public service-list representations coherent after a service mutation. */
async function invalidateServiceListingCaches(serviceId?: string): Promise<void> {
  const jobs: Promise<void>[] = [
    deletePublicCacheEntriesByPrefix('service-listings:'),
    deletePublicCacheEntriesByPrefix('api-public:/api/v1/service-listings?'),
    deletePublicCacheEntriesByPrefix('api-public:/api/v1/service-listings/'),
    deletePublicCacheEntry('home:public-services:v1'),
  ];
  if (serviceId?.trim()) jobs.push(deletePublicCacheEntry(`service-listing:${serviceId.trim()}`));
  await Promise.all(jobs);
}

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
export type ServiceListingPage = { items: ServiceListing[]; page: number; totalPages: number; total: number };
export async function getCachedServiceListingsPage(options: { page?: number; limit?: number; search?: string } = {}): Promise<ServiceListingPage | null> {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const limit = Math.max(1, Math.floor(options.limit ?? 30));
  const cached = await getCachedServiceListings({ ...options, page, limit });
  if (!cached) return null;
  // The current cache stores only page rows, not server metadata. A full page
  // conservatively signals that another page may exist; a live refresh corrects it.
  return { items: cached, page, totalPages: cached.length >= limit ? page + 1 : page, total: cached.length };
}
export async function fetchServiceListingsPage(options: { page?: number; limit?: number; search?: string; signal?: AbortSignal } = {}): Promise<ServiceListingPage> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 30;
  const params = new URLSearchParams({ page: String(page), limit: String(limit), sortBy: 'createdAt', sortOrder: 'desc' });
  if (options.search?.trim()) params.set('search', options.search.trim());
  const cacheKey = serviceListingsCacheKey({ ...options, page, limit });
  let response: Envelope<ServiceListing[]>;
  try { response = await apiRequest<Envelope<ServiceListing[]>>(`/api/v1/service-listings?${params.toString()}`, { signal: options.signal }); }
  catch (error) {
    // A caller cancellation represents a newer screen state, not an offline read.
    if (!canUseStaleCacheAfterReadFailure(error, options.signal)) throw error;
    const cached = await getCachedServiceListings({ ...options, page, limit });
    if (cached) return { items: cached, page, totalPages: cached.length >= limit ? page + 1 : page, total: cached.length };
    throw error;
  }
  const items = readData(response, 'تعذر تحميل الخدمات.');
  if (!Array.isArray(items)) throw new Error('استجابة قائمة الخدمات غير صالحة.');
  const valid = items.filter((item) => item && typeof item.id === 'string' && typeof item.title === 'string');
  await writePublicCache(cacheKey, valid);
  const pagination = response.meta?.pagination;
  return { items: valid, page: pagination?.page ?? page, totalPages: pagination?.totalPages ?? (valid.length >= limit ? page + 1 : page), total: pagination?.total ?? valid.length };
}
export async function fetchServiceListings(options: { page?: number; limit?: number; search?: string; signal?: AbortSignal } = {}): Promise<ServiceListing[]> {
  return (await fetchServiceListingsPage(options)).items;
}
export async function getCachedServiceListing(id: string): Promise<ServiceListing | null> {
  const item = await readPublicCache<ServiceListing>(`service-listing:${id}`);
  return item?.id === id ? item : null;
}
export async function fetchServiceListing(id: string): Promise<ServiceListing> {
  let response: Envelope<ServiceListing>;
  try { response = await apiRequest<Envelope<ServiceListing>>(`/api/v1/service-listings/${encodeURIComponent(id)}`); }
  catch (error) { if (!canUseStaleCacheAfterReadFailure(error)) throw error; const cached = await getCachedServiceListing(id); if (cached) return cached; throw error; }
  const item = readData(response, 'تعذر تحميل تفاصيل الخدمة.');
  if (!item || item.id !== id) throw new Error('استجابة تفاصيل الخدمة غير صالحة.');
  await writePublicCache(`service-listing:${id}`, item);
  return item;
}
export async function fetchServiceRequest(id: string, token: string, signal?: AbortSignal): Promise<ServiceRequest> {
  if (!id.trim()) throw new Error('معرّف طلب الخدمة غير صالح.');
  const response = await apiRequest<Envelope<ServiceRequest>>(`/api/v1/service-requests/${encodeURIComponent(id)}`, { token, signal });
  const item = readData(response, 'تعذر تحميل تفاصيل طلب الخدمة.');
  if (!item || item.id !== id) throw new Error('استجابة تفاصيل طلب الخدمة غير صالحة.');
  return item;
}

export async function fetchServiceRequests(token: string, incoming = false, page = 1, limit = 50, signal?: AbortSignal): Promise<{ items: ServiceRequest[]; page: number; totalPages: number; total: number }> {
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  const safeLimit = Math.min(50, Math.max(1, Math.floor(Number(limit) || 50)));
  const response = await apiRequest<Envelope<ServiceRequest[]>>(`/api/v1/service-requests/${incoming ? 'incoming' : 'me'}?page=${safePage}&limit=${safeLimit}`, { token, signal });
  const items = readData(response, 'تعذر تحميل طلبات الخدمات.');
  if (!Array.isArray(items)) throw new Error('استجابة الطلبات غير صالحة.');
  const pagination = response.meta?.pagination;
  return { items, page: pagination?.page ?? safePage, totalPages: pagination?.totalPages ?? (items.length >= safeLimit ? safePage + 1 : safePage), total: pagination?.total ?? items.length };
}
export async function createServiceRequest(listingId: string, details: string, token: string, csrfToken?: string | null): Promise<ServiceRequest> {
  const response = await apiRequest<Envelope<ServiceRequest>>('/api/v1/service-requests', {
    method: 'POST', token, body: JSON.stringify({ listingId, details: details.trim() }),
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
  });
  return readData(response, 'تعذر إرسال طلب الخدمة.');
}

export async function respondToServiceRequest(id: string, action: 'ACCEPTED' | 'REJECTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'DISPUTED', token: string, csrfToken?: string | null, extra?: { quotedPrice?: number; agreedPrice?: number; disputeReason?: string }): Promise<ServiceRequest> {
  const response = await apiRequest<Envelope<ServiceRequest>>(`/api/v1/service-requests/${encodeURIComponent(id)}/respond`, {
    method: 'PATCH', token, body: JSON.stringify({ action, ...extra }),
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
export async function fetchMyServiceListingsPage(token: string, page = 1, limit = 30, signal?: AbortSignal): Promise<{ items: ServiceListing[]; page: number; totalPages: number; total: number }> {
  const safePage = Math.max(1, Math.floor(page));
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const response = await apiRequest<Envelope<ServiceListing[]>>(`/api/v1/service-listings/me?page=${safePage}&limit=${safeLimit}&sortBy=createdAt&sortOrder=desc`, { token, signal });
  const items = readData(response, 'تعذر تحميل خدماتك.');
  if (!Array.isArray(items)) throw new Error('استجابة خدماتك غير صالحة.');
  const pagination = response.meta?.pagination;
  return {
    items,
    page: pagination?.page ?? safePage,
    totalPages: pagination?.totalPages ?? (items.length >= safeLimit ? safePage + 1 : safePage),
    total: pagination?.total ?? items.length,
  };
}
export async function fetchMyServiceListings(token: string): Promise<ServiceListing[]> {
  return (await fetchMyServiceListingsPage(token, 1, 50)).items;
}
export async function createMyServiceListing(input: { categoryId: string; title: string; description: string; pricingType: 'FIXED'|'STARTING_FROM'|'NEGOTIABLE'; price?: number; durationEstimate?: string; serviceLocation: 'AT_CUSTOMER'|'AT_PROVIDER'|'REMOTE' }, token: string, csrfToken?: string | null, offlineOperationId?: string, images: Array<{uri:string;fileName:string;mimeType:string}> = []): Promise<ServiceListing> {
  const headers = { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...(offlineOperationId ? { 'X-Offline-Op-Id': offlineOperationId } : {}) };
  let body: FormData | string = JSON.stringify(input);
  if (images.length) { const form = new FormData(); for (const [key,value] of Object.entries(input)) if (value !== undefined) form.append(key, typeof value === 'string' ? value : String(value)); for (const image of images) form.append('images', {uri:image.uri,name:image.fileName,type:image.mimeType} as unknown as Blob); body = form; }
  const response = await apiRequest<Envelope<ServiceListing>>('/api/v1/service-listings', { method: 'POST', token, headers, body });
  const created = readData(response, 'تعذر إنشاء الخدمة.');
  await invalidateServiceListingCaches(created.id);
  return created;
}
export async function updateMyServiceListing(id: string, input: Partial<{ categoryId: string; title: string; description: string; pricingType: 'FIXED'|'STARTING_FROM'|'NEGOTIABLE'; price: number|null; durationEstimate: string|null; serviceLocation: 'AT_CUSTOMER'|'AT_PROVIDER'|'REMOTE'; status: 'ACTIVE'|'PAUSED' }>, token: string, csrfToken?: string | null): Promise<ServiceListing> {
  const response = await apiRequest<Envelope<ServiceListing>>(`/api/v1/service-listings/${encodeURIComponent(id)}`, { method: 'PATCH', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify(input) });
  const updated = readData(response, 'تعذر تحديث الخدمة.');
  await invalidateServiceListingCaches(id);
  return updated;
}
export async function deleteMyServiceListing(id: string, token: string, csrfToken?: string | null): Promise<void> {
  const response = await apiRequest<Envelope<unknown>>(`/api/v1/service-listings/${encodeURIComponent(id)}`, { method: 'DELETE', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify({}) });
  if (!response || response.success !== true) throw new Error(response?.message || 'تعذر حذف الخدمة.');
  await invalidateServiceListingCaches(id);
}
