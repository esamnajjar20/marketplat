import { apiRequest } from '@/api/client';

type Envelope<T> = { success: boolean; message?: string; data?: T; meta?: { pagination?: { page?: number; limit?: number; total?: number; totalPages?: number } } };
function dataOf<T>(response: Envelope<T>, fallback: string): T {
  if (!response || response.success !== true || response.data === undefined) throw new Error(response?.message || fallback);
  return response.data;
}
export type StoreSummary = {
  id: string; name: string; description?: string | null; city?: string | null; address?: string | null;
  logoUrl?: string | null; coverImageUrl?: string | null; status?: string; plan?: string;
  phone?: string | null; _count?: { products?: number; followers?: number };
  owner?: { name?: string | null; displayName?: string | null } | null;
  sellerProfile?: { userId?: string; averageRating?: number | string | null; totalRatings?: number; verified?: boolean; user?: { name?: string | null } } | null;
  views?: number;
  isOpen?: boolean | null;
  workingHours?: Record<string, { open: string; close: string } | null> | null;
};
export type ProductSummary = {
  id: string; name: string; description?: string | null; price: number | string;
  discountPrice?: number | string | null; effectivePrice?: { price?: number | string; amount?: number | string } | null;
  images?: string[]; availability?: string; status?: string; stockQuantity?: number | null;
  category?: { id?: string; name?: string; nameAr?: string | null } | null;
  store?: { id?: string; name?: string; logoUrl?: string | null; city?: string | null } | null;
  createdAt?: string;
};
export type ProductCategory = { id: string; name: string; nameAr?: string | null; slug?: string; parentId?: string | null; isActive?: boolean; children?: ProductCategory[] };
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
export async function fetchStore(id: string) { return dataOf(await apiRequest<Envelope<StoreSummary>>(`/api/v1/stores/${encodeURIComponent(id)}`), 'تعذر تحميل المتجر.'); }
export async function toggleStoreFollow(id: string, token: string, csrfToken?: string | null) { return dataOf(await apiRequest<Envelope<{ action: 'followed' | 'unfollowed' }>>(`/api/v1/stores/${encodeURIComponent(id)}/follow`, { method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify({}) }), 'تعذر تحديث متابعة المتجر.'); }
export async function fetchProducts(options: { page?: number; limit?: number; search?: string; storeId?: string; categoryId?: string; hasPromotion?: boolean; sortBy?: 'createdAt' | 'price' | 'views'; sortOrder?: 'asc' | 'desc' } = {}) {
  const page = options.page ?? 1; const sortBy = options.sortBy ?? 'createdAt'; const sortOrder = options.sortOrder ?? (sortBy === 'price' ? 'asc' : 'desc'); const params = new URLSearchParams({ page: String(page), limit: String(options.limit ?? 20), sortBy, sortOrder });
  if (options.search?.trim()) params.set('search', options.search.trim()); if (options.storeId) params.set('storeId', options.storeId); if (options.categoryId) params.set('categoryId', options.categoryId); if (options.hasPromotion) params.set('hasPromotion', 'true');
  const response = await apiRequest<Envelope<ProductSummary[]>>(`/api/v1/products?${params}`);
  return pageFrom(response, 'تعذر تحميل المنتجات.', page);
}
export async function fetchProduct(id: string) { return dataOf(await apiRequest<Envelope<ProductSummary>>(`/api/v1/products/${encodeURIComponent(id)}`), 'تعذر تحميل تفاصيل المنتج.'); }
export async function fetchMyStore(token: string) { return dataOf(await apiRequest<Envelope<StoreSummary | null>>('/api/v1/stores/me', { token }), 'تعذر تحميل متجرك.'); }
export async function createStore(input: { name: string; description: string; city: string; phone: string; address?: string }, token: string, csrfToken?: string | null) {
  return dataOf(await apiRequest<Envelope<StoreSummary>>('/api/v1/stores', { method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify(input) }), 'تعذر إنشاء المتجر.');
}
export async function updateMyStore(input: Partial<Pick<StoreSummary, 'name' | 'description' | 'city' | 'address' | 'phone'>>, token: string, csrfToken?: string | null) {
  return dataOf(await apiRequest<Envelope<StoreSummary>>('/api/v1/stores/me', { method: 'PATCH', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify(input) }), 'تعذر تحديث المتجر.');
}
export async function fetchMyProducts(token: string, search = '', options: { page?: number; limit?: number } = {}) {
  const page = options.page ?? 1; const params = new URLSearchParams({ page: String(page), limit: String(options.limit ?? 50) }); if (search.trim()) params.set('search', search.trim());
  return pageFrom(await apiRequest<Envelope<ProductSummary[]>>(`/api/v1/products/me?${params}`, { token }), 'تعذر تحميل منتجاتك.', page);
}
export async function fetchProductCategories() {
  const response = await apiRequest<Envelope<ProductCategory[]>>('/api/v1/product-categories');
  const categories = dataOf(response, 'تعذر تحميل تصنيفات المنتجات.');
  if (!Array.isArray(categories)) throw new Error('استجابة التصنيفات غير صالحة.');
  const flattened: ProductCategory[] = []; const visit = (nodes: ProductCategory[]) => { for (const category of nodes) { if (!category || typeof category.id !== 'string' || category.isActive === false) continue; flattened.push(category); if (Array.isArray(category.children)) visit(category.children); } }; visit(categories); return flattened;
}
export async function createProduct(input: { categoryId: string; name: string; description: string; price: number; availability: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK'; stockQuantity?: number }, token: string) {
  return dataOf(await apiRequest<Envelope<ProductSummary>>('/api/v1/products', { method: 'POST', token, body: JSON.stringify(input) }), 'تعذر إنشاء المنتج.');
}
export async function updateProduct(id: string, input: Partial<{ categoryId: string; name: string; description: string; price: number; availability: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK'; stockQuantity: number; status: string }>, token: string) {
  return dataOf(await apiRequest<Envelope<ProductSummary>>(`/api/v1/products/${encodeURIComponent(id)}`, { method: 'PATCH', token, body: JSON.stringify(input) }), 'تعذر تحديث المنتج.');
}
export async function deleteProduct(id: string, token: string) {
  return dataOf(await apiRequest<Envelope<unknown>>(`/api/v1/products/${encodeURIComponent(id)}`, { method: 'DELETE', token, body: JSON.stringify({}) }), 'تعذر حذف المنتج.');
}


export type StoreReview = {
  id: string; score: number; comment?: string | null; createdAt: string;
  rater: { id: string; name: string; avatarUrl?: string | null };
};
export type StoreAnalytics = {
  views: number; followers: number; newFollowers7d: number; newFollowers30d: number;
  activeProducts: number; activePromotions: number; promotionUses: number;
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
  const response = await apiRequest<Envelope<unknown>>(`/api/v1/stores/${encodeURIComponent(id)}/reviews`, { method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify(input) });
  if (!response || response.success !== true) throw new Error(response?.message || 'تعذر إرسال تقييم المتجر.');
  return response.data;
}
export async function uploadMyStoreImage(kind: 'logo' | 'cover', asset: { uri: string; fileName?: string | null; mimeType?: string | null }, token: string, csrfToken?: string | null) {
  const form = new FormData();
  form.append('image', { uri: asset.uri, name: asset.fileName || `store-${kind}-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' } as unknown as Blob);
  return dataOf(await apiRequest<Envelope<StoreSummary>>(`/api/v1/stores/me/${kind}`, { method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: form }), `تعذر تحديث ${kind === 'logo' ? 'شعار' : 'غلاف'} المتجر.`);
}
export async function fetchMyStoreAnalytics(token: string) {
  return dataOf(await apiRequest<Envelope<StoreAnalytics>>('/api/v1/stores/me/analytics', { token }), 'تعذر تحميل إحصاءات المتجر.');
}
export async function fetchMyFollowedStores(token: string, page = 1, limit = 20) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  return pageFrom(await apiRequest<Envelope<FollowedStoreRow[]>>(`/api/v1/stores/me/followed?${params}`, { token }), 'تعذر تحميل المتاجر التي تتابعها.', page);
}
