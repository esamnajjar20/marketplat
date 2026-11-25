import { apiRequest } from '@/api/client';
import type { ProductSummary, StoreSummary } from '@/features/commerce/commerce.api';

type Envelope<T> = { success: boolean; message?: string; data?: T; meta?: { pagination?: { page?: number; limit?: number; totalPages?: number; total?: number; hasNextPage?: boolean; hasPrevPage?: boolean } } };
function unwrap<T>(r: Envelope<T>, fallback: string): T { if (!r || r.success !== true || r.data === undefined) throw new Error(r?.message || fallback); return r.data; }
function headers(csrfToken?: string | null) { return csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined; }
export type StoreCollection = { id: string; storeId?: string; name: string; slug?: string; description?: string | null; imageUrl?: string | null; sortOrder?: number; isActive: boolean; _count?: { products?: number }; products?: ProductSummary[] };
export type StorePromotion = { id: string; productId: string; title: string; description?: string | null; discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'; discountValue: number | string; startsAt: string; endsAt: string; status: string; maxUses?: number | null; usageCount: number; product?: ProductSummary };
export type StoreMember = { id: string; role: 'MANAGER' | 'STAFF' | 'EDITOR'; status: 'PENDING' | 'ACTIVE' | 'REMOVED'; invitedAt?: string; acceptedAt?: string | null; user?: { id: string; name?: string | null; email?: string; avatarUrl?: string | null }; invitedBy?: { id: string; name?: string | null }; store?: { id: string; name: string; slug?: string; logoUrl?: string | null } };
export async function fetchMyCollections(token: string, storeId?: string): Promise<StoreCollection[]> { const path = storeId ? `/api/v1/collections/me?storeId=${encodeURIComponent(storeId)}` : '/api/v1/collections/me'; const a = unwrap(await apiRequest<Envelope<StoreCollection[]>>(path, { token }), 'تعذر تحميل مجموعات المتجر.'); if (!Array.isArray(a)) throw new Error('استجابة القائمة غير صالحة.'); return a; }
export async function createCollection(input: { name: string; description?: string }, token: string, csrfToken?: string | null, storeId?: string): Promise<StoreCollection> { const path = storeId ? `/api/v1/collections?storeId=${encodeURIComponent(storeId)}` : '/api/v1/collections'; return unwrap(await apiRequest<Envelope<StoreCollection>>(path, { method: 'POST', token, headers: headers(csrfToken), body: JSON.stringify(input) }), 'تعذر إنشاء المجموعة.'); }
export async function updateCollection(id: string, input: Partial<Pick<StoreCollection, 'name' | 'description' | 'isActive'>>, token: string, csrfToken?: string | null): Promise<StoreCollection> { return unwrap(await apiRequest<Envelope<StoreCollection>>(`/api/v1/collections/${encodeURIComponent(id)}`, { method: 'PATCH', token, headers: headers(csrfToken), body: JSON.stringify(input) }), 'تعذر تحديث المجموعة.'); }
export async function deleteCollection(id: string, token: string, csrfToken?: string | null): Promise<void> { unwrap(await apiRequest<Envelope<unknown>>(`/api/v1/collections/${encodeURIComponent(id)}`, { method: 'DELETE', token, headers: headers(csrfToken), body: JSON.stringify({}) }), 'تعذر حذف المجموعة.'); }
export async function addProductToCollection(id: string, productId: string, token: string, csrfToken?: string | null): Promise<void> { unwrap(await apiRequest<Envelope<unknown>>(`/api/v1/collections/${encodeURIComponent(id)}/products/${encodeURIComponent(productId)}`, { method: 'POST', token, headers: headers(csrfToken), body: JSON.stringify({}) }), 'تعذر إضافة المنتج للمجموعة.'); }
export async function removeProductFromCollection(id: string, productId: string, token: string, csrfToken?: string | null): Promise<void> { unwrap(await apiRequest<Envelope<unknown>>(`/api/v1/collections/${encodeURIComponent(id)}/products/${encodeURIComponent(productId)}`, { method: 'DELETE', token, headers: headers(csrfToken), body: JSON.stringify({}) }), 'تعذر إزالة المنتج من المجموعة.'); }
export async function fetchPublicCollections(storeId: string, signal?: AbortSignal): Promise<StoreCollection[]> { const a = unwrap(await apiRequest<Envelope<StoreCollection[]>>(`/api/v1/collections/store/${encodeURIComponent(storeId)}`, { signal }), 'تعذر تحميل مجموعات المتجر.'); if (!Array.isArray(a)) throw new Error('استجابة القائمة غير صالحة.'); return a; }
export async function fetchPublicCollectionProducts(id: string): Promise<ProductSummary[]> { const a = unwrap(await apiRequest<Envelope<ProductSummary[]>>(`/api/v1/collections/${encodeURIComponent(id)}/products`), 'تعذر تحميل منتجات المجموعة.'); if (!Array.isArray(a)) throw new Error('استجابة القائمة غير صالحة.'); return a; }

export async function fetchManagedCollectionProducts(id: string, token: string): Promise<ProductSummary[]> {
  const a = unwrap(await apiRequest<Envelope<ProductSummary[]>>(`/api/v1/collections/${encodeURIComponent(id)}/manage-products`, { token }), 'تعذر تحميل منتجات المجموعة للإدارة.');
  if (!Array.isArray(a)) throw new Error('استجابة منتجات المجموعة غير صالحة.');
  return a;
}
export async function fetchMyPromotions(token: string, storeId?: string, page = 1): Promise<{ items: StorePromotion[]; page: number; total: number; totalPages: number; hasNextPage: boolean }> { const params = new URLSearchParams({ page: String(Math.max(1, Math.trunc(page))), limit: '50' }); if (storeId) params.set('storeId', storeId); const response = await apiRequest<Envelope<StorePromotion[]>>(`/api/v1/promotions/me?${params}`, { token }); const items = unwrap(response, 'تعذر تحميل العروض الترويجية.'); const pagination = response.meta?.pagination; if (!Array.isArray(items) || !pagination) throw new Error('استجابة القائمة غير صالحة.'); const resolvedPage = pagination.page ?? Math.max(1, Math.trunc(page)); const totalPages = pagination.totalPages ?? resolvedPage; return { items, page: resolvedPage, total: pagination.total ?? items.length, totalPages, hasNextPage: pagination.hasNextPage ?? resolvedPage < totalPages }; }
export async function createPromotion(input: { productId: string; title: string; description?: string; discountType: 'PERCENTAGE' | 'FIXED_AMOUNT'; discountValue: number; startsAt: string; endsAt: string; maxUses?: number }, token: string, csrfToken?: string | null, storeId?: string): Promise<StorePromotion> { const path = storeId ? `/api/v1/promotions?storeId=${encodeURIComponent(storeId)}` : '/api/v1/promotions'; return unwrap(await apiRequest<Envelope<StorePromotion>>(path, { method: 'POST', token, headers: headers(csrfToken), body: JSON.stringify(input) }), 'تعذر إنشاء العرض.'); }
export async function cancelPromotion(id: string, token: string, csrfToken?: string | null): Promise<void> { unwrap(await apiRequest<Envelope<unknown>>(`/api/v1/promotions/${encodeURIComponent(id)}`, { method: 'DELETE', token, headers: headers(csrfToken), body: JSON.stringify({}) }), 'تعذر إلغاء العرض.'); }
export type StoreMembersPage = { items: StoreMember[]; page: number; limit: number; total: number; totalPages: number };
export async function fetchStoreMembers(storeId: string, token: string, options: { page?: number; limit?: number } = {}): Promise<StoreMembersPage> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 20;
  const response = await apiRequest<Envelope<StoreMember[]>>(`/api/v1/stores/${encodeURIComponent(storeId)}/members?page=${page}&limit=${limit}`, { token });
  const items = unwrap(response, 'تعذر تحميل أعضاء المتجر.');
  if (!Array.isArray(items)) throw new Error('استجابة القائمة غير صالحة.');
  const pagination = response.meta?.pagination;
  return { items, page: pagination?.page ?? page, limit, total: pagination?.total ?? items.length, totalPages: pagination?.totalPages ?? page };
}
export async function inviteStoreMember(storeId: string, email: string, role: StoreMember['role'], token: string, csrfToken?: string | null): Promise<StoreMember> { return unwrap(await apiRequest<Envelope<StoreMember>>(`/api/v1/stores/${encodeURIComponent(storeId)}/members`, { method: 'POST', token, headers: headers(csrfToken), body: JSON.stringify({ email, role }) }), 'تعذر إرسال الدعوة.'); }
export async function updateStoreMemberRole(storeId: string, memberId: string, role: StoreMember['role'], token: string, csrfToken?: string | null): Promise<StoreMember> { return unwrap(await apiRequest<Envelope<StoreMember>>(`/api/v1/stores/${encodeURIComponent(storeId)}/members/${encodeURIComponent(memberId)}`, { method: 'PATCH', token, headers: headers(csrfToken), body: JSON.stringify({ role }) }), 'تعذر تعديل صلاحية العضو.'); }
export async function removeStoreMember(storeId: string, memberId: string, token: string, csrfToken?: string | null): Promise<void> { unwrap(await apiRequest<Envelope<unknown>>(`/api/v1/stores/${encodeURIComponent(storeId)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE', token, headers: headers(csrfToken), body: JSON.stringify({}) }), 'تعذر إزالة العضو.'); }

export async function fetchManagedStoreSettings(storeId: string, token: string): Promise<StoreSummary> {
  return unwrap(await apiRequest<Envelope<StoreSummary>>(`/api/v1/stores/${encodeURIComponent(storeId)}/settings`, { token }), 'تعذر تحميل إعدادات المتجر.');
}
export async function updateManagedStoreSettings(storeId: string, input: Partial<Pick<StoreSummary, 'name' | 'description' | 'city' | 'address' | 'phone' | 'workingHours'>>, token: string, csrfToken?: string | null): Promise<StoreSummary> {
  return unwrap(await apiRequest<Envelope<StoreSummary>>(`/api/v1/stores/${encodeURIComponent(storeId)}/settings`, { method: 'PATCH', token, headers: headers(csrfToken), body: JSON.stringify(input) }), 'تعذر تحديث إعدادات المتجر.');
}
export async function fetchMyStoreInvites(token: string): Promise<StoreMember[]> { const a = unwrap(await apiRequest<Envelope<StoreMember[]>>('/api/v1/stores/me/member-invites', { token }), 'تعذر تحميل الدعوات.'); if (!Array.isArray(a)) throw new Error('استجابة القائمة غير صالحة.'); return a; }
export async function acceptStoreInvite(memberId: string, token: string, csrfToken?: string | null): Promise<StoreMember> { return unwrap(await apiRequest<Envelope<StoreMember>>(`/api/v1/stores/me/member-invites/${encodeURIComponent(memberId)}/accept`, { method: 'POST', token, headers: headers(csrfToken), body: JSON.stringify({}) }), 'تعذر قبول الدعوة.'); }
export async function saveStoreHours(workingHours: Record<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat', { open: string; close: string } | null>, token: string, csrfToken?: string | null): Promise<StoreSummary> { return unwrap(await apiRequest<Envelope<StoreSummary>>('/api/v1/stores/me', { method: 'PATCH', token, headers: headers(csrfToken), body: JSON.stringify({ workingHours }) }), 'تعذر حفظ ساعات العمل.'); }


export type StoreMembership = {
  id: string;
  role: StoreMember['role'];
  status: 'ACTIVE';
  invitedAt?: string;
  acceptedAt?: string | null;
  store: { id: string; name: string; slug?: string | null; status?: string; city?: string | null; logoUrl?: string | null; coverImageUrl?: string | null };
};
export async function fetchMyActiveStoreMemberships(token: string): Promise<StoreMembership[]> {
  const items = unwrap(await apiRequest<Envelope<StoreMembership[]>>('/api/v1/stores/me/memberships', { token }), 'تعذر تحميل المتاجر التي تعمل بها.');
  if (!Array.isArray(items)) throw new Error('استجابة المتاجر التي تعمل بها غير صالحة.');
  return items.filter((item) => item?.status === 'ACTIVE' && typeof item.store?.id === 'string');
}
