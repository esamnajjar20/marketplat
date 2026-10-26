import { apiRequest } from '@/api/client';
import type { PageResult } from './commerce.api';

export type MarketplaceOrderStatus = 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type MarketplaceOrderItem = { id: string; productId?: string | null; productName: string; productImage?: string | null; quantity: number; unitPrice: number | string; lineTotal: number | string };
export type MarketplaceOrder = {
  id: string; buyerId: string; sellerId: string; storeId: string; status: MarketplaceOrderStatus;
  currency: string; subtotal: number | string; shippingFee: number | string; total: number | string;
  paymentMethod: string; paymentStatus: string; recipientName: string; recipientPhone: string;
  shippingCity: string; shippingAddress: string; buyerNote?: string | null; sellerNote?: string | null;
  createdAt: string; updatedAt: string; items: MarketplaceOrderItem[];
  store?: { id: string; name: string; logoUrl?: string | null; city?: string | null; phone?: string | null };
  buyer?: { id: string; name: string; phone?: string | null }; seller?: { id: string; name: string; phone?: string | null };
};
type Envelope<T> = { success: boolean; message?: string; data?: T; meta?: { pagination?: { page?: number; limit?: number; total?: number; totalPages?: number } } };
function unwrap<T>(response: Envelope<T>, fallback: string): T {
  if (response?.success !== true || response.data === undefined) throw new Error(response?.message || fallback);
  return response.data;
}
function page<T>(response: Envelope<T[]>, fallback: string, requestedPage: number): PageResult<T> {
  const items = unwrap(response, fallback);
  if (!Array.isArray(items)) throw new Error('استجابة الطلبات غير صالحة.');
  const meta = response.meta?.pagination;
  return { items, page: meta?.page ?? requestedPage, totalPages: meta?.totalPages ?? requestedPage, total: meta?.total ?? items.length };
}
export async function createMarketplaceOrder(input: { items: { productId: string; quantity: number }[]; recipientName: string; recipientPhone: string; shippingCity: string; shippingAddress: string; buyerNote?: string; idempotencyKey: string }, token: string, csrfToken?: string | null) {
  return unwrap(await apiRequest<Envelope<MarketplaceOrder>>('/api/v1/orders', { method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify(input) }), 'تعذر إنشاء الطلب.');
}
export async function fetchMyOrders(token: string, pageNo = 1, status?: MarketplaceOrderStatus) {
  const params = new URLSearchParams({ page: String(pageNo), limit: '20' }); if (status) params.set('status', status);
  return page(await apiRequest<Envelope<MarketplaceOrder[]>>(`/api/v1/orders/mine?${params}`, { token }), 'تعذر تحميل طلباتك.', pageNo);
}
export async function fetchSellerOrders(token: string, pageNo = 1, status?: MarketplaceOrderStatus) {
  const params = new URLSearchParams({ page: String(pageNo), limit: '20' }); if (status) params.set('status', status);
  return page(await apiRequest<Envelope<MarketplaceOrder[]>>(`/api/v1/orders/seller?${params}`, { token }), 'تعذر تحميل طلبات المتجر.', pageNo);
}
export async function fetchMarketplaceOrder(id: string, token: string) {
  return unwrap(await apiRequest<Envelope<MarketplaceOrder>>(`/api/v1/orders/${encodeURIComponent(id)}`, { token }), 'تعذر تحميل تفاصيل الطلب.');
}
export async function updateMarketplaceOrderStatus(id: string, status: MarketplaceOrderStatus, token: string, csrfToken?: string | null, sellerNote?: string) {
  return unwrap(await apiRequest<Envelope<MarketplaceOrder>>(`/api/v1/orders/${encodeURIComponent(id)}/status`, { method: 'PATCH', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify({ status, sellerNote }) }), 'تعذر تحديث حالة الطلب.');
}
