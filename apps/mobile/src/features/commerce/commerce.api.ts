import { cacheOfflineCreationReferenceData, readOfflineCreationReferenceData } from '@/storage/entity-create-outbox';
import { ApiError, apiRequest } from '@/api/client';
import { uploadMobileImagesDirect } from '../media/direct-upload.api';
import { deletePublicCacheEntriesByPrefix, deletePublicCacheEntry } from '@/storage/public-cache';

type Envelope<T> = { success: boolean; message?: string; data?: T; meta?: { pagination?: { page?: number; limit?: number; total?: number; totalPages?: number } } };

/** Invalidate anonymous product reads and the compact homepage snapshot after a mutation. */
async function invalidateProductCaches(productId?: string): Promise<void> {
  const jobs: Promise<void>[] = [
    deletePublicCacheEntriesByPrefix('api-public:/api/v1/products?'),
    deletePublicCacheEntriesByPrefix('api-public:/api/v1/products/'),
    deletePublicCacheEntry('home:public-products:v1'),
  ];
  if (productId?.trim()) jobs.push(deletePublicCacheEntry(`api-public:/api/v1/products/${encodeURIComponent(productId.trim())}`));
  await Promise.all(jobs);
}

function dataOf<T>(response: Envelope<T>, fallback: string): T {
  if (!response || response.success !== true || response.data === undefined) throw new Error(response?.message || fallback);
  return response.data;
}
export type StoreSummary = {
  id: string; name: string; slug?: string | null; description?: string | null; city?: string | null; address?: string | null;
  logoUrl?: string | null; coverImageUrl?: string | null; status?: string; plan?: string;
  phone?: string | null; latitude?: number | string | null; longitude?: number | string | null; storeTypeId?: string | null; storeType?: { id?: string; fields?: StoreTypeFieldSummary[] | null } | null; _count?: { products?: number; followers?: number };
  owner?: { name?: string | null; displayName?: string | null } | null;
  sellerProfile?: { userId?: string; averageRating?: number | string | null; totalRatings?: number; verified?: boolean; paymentMethods?: unknown; user?: { name?: string | null } } | null;
  views?: number;
  isOpen?: boolean | null;
  workingHours?: Record<string, { open: string; close: string } | null> | null;
};
export type ProductSummary = {
  id: string; name: string; description?: string | null; price: number | string;
  discountPrice?: number | string | null; effectivePrice?: { price?: number | string; amount?: number | string; originalPrice?: number | string; discountPrice?: number | string | null; discountPercentage?: number | null; hasActivePromotion?: boolean; activePromotionId?: string | null } | null;
  images?: string[]; availability?: string; status?: string; stockQuantity?: number | null; wholesalePrice?: number | string | null; wholesaleMinQty?: number | null; costPrice?: number | string | null;
  category?: { id?: string; name?: string; nameAr?: string | null } | null;
  createdAt?: string; views?: number; attributes?: Record<string, unknown> | null;
  store?: {
    id?: string; name?: string; logoUrl?: string | null; city?: string | null; phone?: string | null; storeTypeId?: string | null;
    sellerProfile?: { userId?: string; paymentMethods?: unknown; averageRating?: number | string | null; totalRatings?: number; verified?: boolean; user?: { name?: string | null } } | null;
    storeType?: { fields?: { id?: string; key: string; label?: string | null; labelAr?: string | null; pageLabelAr?: string | null; type?: string; scope?: string; isActive?: boolean; options?: { value?: unknown; label?: string; labelAr?: string }[] | null }[] | null } | null;
  } | null;
};
export type ProductCategory = { id: string; name: string; nameAr?: string | null; slug?: string; parentId?: string | null; isActive?: boolean; children?: ProductCategory[] };
export type StoreTypeFieldSummary = { id?: string; key: string; label?: string | null; labelAr?: string | null; cardLabelAr?: string | null; pageLabelAr?: string | null; scope?: 'PRODUCT' | 'STORE' | string; type: 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'SELECT' | string; required?: boolean; isActive?: boolean; options?: Array<{ value: string; label?: string; labelAr?: string }> | null };
export type PageResult<T> = { items: T[]; page: number; totalPages: number; total: number };
function pageFrom<T>(response: Envelope<T[]>, fallback: string, page: number): PageResult<T> {
  const items = dataOf(response, fallback);
  if (!Array.isArray(items)) throw new Error('استجابة القائمة غير صالحة.');
  const pagination = response.meta?.pagination;
  return { items, page: pagination?.page ?? page, totalPages: pagination?.totalPages ?? page, total: pagination?.total ?? items.length };
}
export async function fetchStores(options: { page?: number; limit?: number; search?: string; city?: string } = {}) {
  const page = options.page ?? 1; const params = new URLSearchParams({ page: String(page), limit: String(options.limit ?? 20), sortBy: 'createdAt', sortOrder: 'desc' });
  if (options.search?.trim()) params.set('search', options.search.trim()); if (options.city?.trim()) params.set('city', options.city.trim());
  const response = await apiRequest<Envelope<StoreSummary[]>>(`/api/v1/stores?${params}`);
  return pageFrom(response, 'تعذر تحميل المتاجر.', page);
}
export async function fetchStore(id: string) {
  const path = `/api/v1/stores/${encodeURIComponent(id)}`;
  try {
    return dataOf(await apiRequest<Envelope<StoreSummary>>(path), 'تعذر تحميل المتجر.');
  } catch (error) {
    if (error instanceof ApiError && error.code === 'PUBLIC_ACCOUNT_BLOCKED') {
      await Promise.all([
        deletePublicCacheEntry(`api-public:${path}`),
        deletePublicCacheEntriesByPrefix('api-public:/api/v1/stores?'),
      ]);
    }
    throw error;
  }
}
export async function toggleStoreFollow(id: string, token: string, csrfToken?: string | null) { return dataOf(await apiRequest<Envelope<{ action: 'followed' | 'unfollowed' }>>(`/api/v1/stores/${encodeURIComponent(id)}/follow`, { method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify({}) }), 'تعذر تحديث متابعة المتجر.'); }
export async function fetchProducts(options: { page?: number; limit?: number; search?: string; storeId?: string; categoryId?: string; city?: string; minPrice?: number; maxPrice?: number; hasPromotion?: boolean; sortBy?: 'createdAt' | 'price' | 'views'; sortOrder?: 'asc' | 'desc'; signal?: AbortSignal } = {}) {
  const page = options.page ?? 1; const sortBy = options.sortBy ?? 'createdAt'; const sortOrder = options.sortOrder ?? (sortBy === 'price' ? 'asc' : 'desc'); const params = new URLSearchParams({ page: String(page), limit: String(options.limit ?? 20), sortBy, sortOrder });
  if (options.search?.trim()) params.set('search', options.search.trim()); if (options.storeId) params.set('storeId', options.storeId); if (options.categoryId) params.set('categoryId', options.categoryId); if (options.city?.trim()) params.set('city', options.city.trim()); if (options.minPrice !== undefined) params.set('minPrice', String(options.minPrice)); if (options.maxPrice !== undefined) params.set('maxPrice', String(options.maxPrice)); if (options.hasPromotion) params.set('hasPromotion', 'true');
  const response = await apiRequest<Envelope<ProductSummary[]>>(`/api/v1/products?${params}`, { signal: options.signal });
  return pageFrom(response, 'تعذر تحميل المنتجات.', page);
}
export async function fetchProduct(id: string) {
  const path = `/api/v1/products/${encodeURIComponent(id)}`;
  try {
    return dataOf(await apiRequest<Envelope<ProductSummary>>(path), 'تعذر تحميل تفاصيل المنتج.');
  } catch (error) {
    if (error instanceof ApiError && error.code === 'PUBLIC_ACCOUNT_BLOCKED') {
      await Promise.all([
        deletePublicCacheEntry(`api-public:${path}`),
        deletePublicCacheEntriesByPrefix('api-public:/api/v1/products?'),
      ]);
    }
    throw error;
  }
}
export async function fetchMyStore(token: string): Promise<StoreSummary | null> {
  try {
    return dataOf(await apiRequest<Envelope<StoreSummary | null>>('/api/v1/stores/me', { token }), 'تعذر تحميل متجرك.');
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.code === 'STORE_NOT_FOUND' || error.code === 'SELLER_NOT_FOUND')) return null;
    throw error;
  }
}
export async function createStore(input: { name: string; description: string; city: string; phone: string; address?: string }, token: string, csrfToken?: string | null) {
  return dataOf(await apiRequest<Envelope<StoreSummary>>('/api/v1/stores', { method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify(input) }), 'تعذر إنشاء المتجر.');
}
export async function updateMyStore(input: Partial<Pick<StoreSummary, 'name' | 'description' | 'city' | 'address' | 'phone'>>, token: string, csrfToken?: string | null) {
  return dataOf(await apiRequest<Envelope<StoreSummary>>('/api/v1/stores/me', { method: 'PATCH', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify(input) }), 'تعذر تحديث المتجر.');
}
export async function fetchMyProducts(token: string, search = '', options: { page?: number; limit?: number; signal?: AbortSignal; storeId?: string } = {}) {
  const page = options.page ?? 1; const params = new URLSearchParams({ page: String(page), limit: String(options.limit ?? 50) }); if (search.trim()) params.set('search', search.trim()); if (options.storeId) params.set('storeId', options.storeId);
  return pageFrom(await apiRequest<Envelope<ProductSummary[]>>(`/api/v1/products/me?${params}`, { token, signal: options.signal }), 'تعذر تحميل منتجاتك.', page);
}
export async function fetchProductCategories() {
  try {
    const response = await apiRequest<Envelope<ProductCategory[]>>('/api/v1/product-categories');
    const categories = dataOf(response, 'تعذر تحميل تصنيفات المنتجات.');
    if (!Array.isArray(categories)) throw new Error('استجابة التصنيفات غير صالحة.');
    const flattened: ProductCategory[] = []; const visit = (nodes: ProductCategory[]) => { for (const category of nodes) { if (!category || typeof category.id !== 'string' || category.isActive === false) continue; flattened.push(category); if (Array.isArray(category.children)) visit(category.children); } }; visit(categories);
    await cacheOfflineCreationReferenceData('product-categories', flattened).catch(() => undefined);
    return flattened;
  } catch (error) {
    const cached = await readOfflineCreationReferenceData<ProductCategory[]>('product-categories').catch(() => null);
    if (Array.isArray(cached) && cached.length) return cached.filter((item) => item && typeof item.id === 'string' && item.isActive !== false);
    throw error;
  }
}
export async function fetchStoreTypeFields(storeTypeId: string): Promise<StoreTypeFieldSummary[]> {
  if (!storeTypeId.trim()) return [];
  const response = await apiRequest<Envelope<StoreTypeFieldSummary[]>>(`/api/v1/store-types/${encodeURIComponent(storeTypeId)}/fields`);
  const fields = dataOf(response, 'تعذر تحميل خصائص نوع المتجر.');
  if (!Array.isArray(fields)) throw new Error('استجابة خصائص نوع المتجر غير صالحة.');
  return fields.filter((field) => field && typeof field.key === 'string' && field.isActive !== false && field.scope === 'PRODUCT');
}

export type ProductWriteInput = {
  categoryId: string; name: string; description: string; price: number;
  availability: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK'; stockQuantity?: number;
  discountPrice?: number; wholesalePrice?: number; wholesaleMinQty?: number; costPrice?: number;
  attributes?: Record<string, string | number | boolean>;
};
export async function createProduct(input: ProductWriteInput, token: string, csrfToken?: string | null, offlineOperationId?: string, images: Array<{uri:string;fileName:string;mimeType:string;fileSize?:number|null}> = [], storeId?: string) {
  const scopedInput = { ...input, ...(storeId ? { storeId } : {}) };
  const directImagePublicIds = await uploadMobileImagesDirect(images, 'products', token, csrfToken);
  const headers = { ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}), ...(offlineOperationId ? { 'X-Offline-Op-Id': offlineOperationId } : {}) };
  const response = await apiRequest<Envelope<ProductSummary>>('/api/v1/products', {
    method: 'POST', token, headers,
    body: JSON.stringify({ ...scopedInput, directImagePublicIds }),
  });
  const created = dataOf(response, 'تعذر إنشاء المنتج.');
  await invalidateProductCaches(created.id);
  return created;
}
export async function addProductImages(id: string, images: Array<{ uri: string; fileName: string; mimeType: string; fileSize?: number | null }>, token: string, csrfToken?: string | null) {
  if (!images.length) return fetchProduct(id);
  const directImagePublicIds = await uploadMobileImagesDirect(images, 'products', token, csrfToken);
  const updated = dataOf(await apiRequest<Envelope<ProductSummary>>(`/api/v1/products/${encodeURIComponent(id)}/images`, {
    method: 'POST', token,
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    body: JSON.stringify({ directImagePublicIds }),
  }), 'تعذر رفع صور المنتج.');
  await invalidateProductCaches(id);
  return updated;
}
export async function removeProductImage(id: string, imageUrl: string, token: string, csrfToken?: string | null) {
  const updated = dataOf(await apiRequest<Envelope<ProductSummary>>(`/api/v1/products/${encodeURIComponent(id)}/images`, { method: 'DELETE', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify({ imageUrl }) }), 'تعذر حذف صورة المنتج.');
  await invalidateProductCaches(id);
  return updated;
}

export async function deleteProduct(id: string, token: string, csrfToken?: string | null) {
  const result = dataOf(await apiRequest<Envelope<unknown>>(`/api/v1/products/${encodeURIComponent(id)}`, { method: 'DELETE', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify({}) }), 'تعذر حذف المنتج.');
  await invalidateProductCaches(id);
  return result;
}


export type StoreReview = {
  id: string; score: number; comment?: string | null; createdAt: string;
  rater: { id: string; name: string; avatarUrl?: string | null };
};
export type StoreAnalytics = {
  views: number; followers: number; newFollowers7d: number; newFollowers30d: number;
  activeProducts: number; activePromotions: number; promotionUses: number;
  orders: {
    totalCount: number;
    byStatus: Record<'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED', number>;
    nonCancelledValueByCurrency: { currency: string; total: number }[];
    deliveredValueByCurrency: { currency: string; total: number }[];
  };
  topProducts: { id: string; name: string; views: number; image?: string | null }[];
};
export type FollowedStoreRow = { id: string; store: StoreSummary; createdAt?: string };

export async function fetchStoreFollowStatus(id: string, token: string) {
  return dataOf(await apiRequest<Envelope<{ following: boolean }>>(`/api/v1/follows/status/STORE/${encodeURIComponent(id)}`, { token }), 'تعذر تحميل حالة متابعة المتجر.');
}
export async function fetchStoreReviews(id: string, options: { page?: number; limit?: number } = {}) {
  const page = options.page ?? 1;
  const params = new URLSearchParams({ page: String(page), limit: String(options.limit ?? 10) });
  return pageFrom(await apiRequest<Envelope<StoreReview[]>>(`/api/v1/stores/${encodeURIComponent(id)}/reviews?${params}`), 'تعذر تحميل تقييمات المتجر.', page);
}
export async function createStoreReview(id: string, input: { score: number; comment?: string }, token: string, csrfToken?: string | null) {
  return dataOf(await apiRequest<Envelope<unknown>>(`/api/v1/stores/${encodeURIComponent(id)}/reviews`, { method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify(input) }), 'تعذر إرسال تقييم المتجر.');
}
export async function uploadMyStoreImage(kind: 'logo' | 'cover', asset: { uri: string; fileName?: string | null; mimeType?: string | null }, token: string, csrfToken?: string | null) {
  const form = new FormData();
  form.append('image', { uri: asset.uri, name: asset.fileName || `store-${kind}-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' } as unknown as Blob);
  return dataOf(await apiRequest<Envelope<StoreSummary>>(`/api/v1/stores/me/${kind}`, { method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: form }), `تعذر تحديث ${kind === 'logo' ? 'شعار' : 'غلاف'} المتجر.`);
}
export async function fetchMyStoreAnalytics(token: string) {
  return dataOf(await apiRequest<Envelope<StoreAnalytics>>('/api/v1/stores/me/analytics', { token }), 'تعذر تحميل إحصاءات المتجر.');
}
export async function fetchMyFollowedStores(token: string, page = 1, limit = 20, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return pageFrom(await apiRequest<Envelope<FollowedStoreRow[]>>(`/api/v1/stores/me/followed?${params}`, { token, signal }), 'تعذر تحميل المتاجر التي تتابعها.', page);
}

export async function updateProduct(
  id: string,
  input: Partial<{
    categoryId: string;
    name: string;
    description: string;
    price: number;
    availability: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK';
    stockQuantity: number | null;
    discountPrice: number | null;
    wholesalePrice: number | null;
    wholesaleMinQty: number | null;
    costPrice: number | null;
    attributes: Record<string, string | number | boolean>;
    status: string;
  }>,
  token: string,
  csrfToken?: string | null
): Promise<ProductSummary> {
  const updated = dataOf(
    await apiRequest<Envelope<ProductSummary>>(
      `/api/v1/products/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        token,
        headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
        body: JSON.stringify(input),
      }
    ),
    'تعذر تحديث المنتج.'
  );
  await invalidateProductCaches(id);
  return updated;
}
