import type { ApiResponse, PaginationMeta } from '@/types/api.types';
import { apiClient } from './client';
import { buildFilterParams, type FilterPatch } from '../../shared/filters';
import type { MarketplaceOrderStatus } from '@marketplat/contracts';
export type { MarketplaceOrderStatus } from '@marketplat/contracts';

export type MarketplaceOrderItem = {
  id: string;
  productId: string | null;
  productName: string;
  productImage: string | null;
  quantity: number;
  unitPrice: number | string;
  lineTotal: number | string;
};
export type MarketplaceOrder = {
  id: string;
  buyerId: string;
  sellerId: string;
  storeId: string;
  status: MarketplaceOrderStatus;
  currency: string;
  subtotal: number | string;
  shippingFee: number | string;
  total: number | string;
  paymentMethod: string;
  paymentStatus: string;
  recipientName: string;
  recipientPhone: string;
  shippingCity: string;
  shippingAddress: string;
  buyerNote: string | null;
  sellerNote: string | null;
  createdAt: string;
  updatedAt: string;
  items: MarketplaceOrderItem[];
  store: { id: string; name: string; logoUrl: string | null; city: string | null; phone: string | null };
  buyer: { id: string; name: string; phone: string | null };
  seller: { id: string; name: string; phone: string | null };
};

export const marketplaceOrdersApi = {
  listMine: (params: { page?: number; limit?: number; status?: string } = {}, config?: { signal?: AbortSignal }) =>
    apiClient.get<ApiResponse<MarketplaceOrder[]>>('/orders/mine', { ...config, params: buildFilterParams({ ...params } as FilterPatch, { profile: 'marketplaceOrders' }) }),
  listForStore: (params: { page?: number; limit?: number; status?: string } = {}, config?: { signal?: AbortSignal }) =>
    apiClient.get<ApiResponse<MarketplaceOrder[]>>('/orders/seller', { ...config, params: buildFilterParams({ ...params } as FilterPatch, { profile: 'marketplaceOrders' }) }),
  getById: (id: string, config?: { signal?: AbortSignal }) =>
    apiClient.get<ApiResponse<MarketplaceOrder>>(`/orders/${encodeURIComponent(id)}`, config),
  updateStatus: (id: string, status: MarketplaceOrderStatus, sellerNote?: string) =>
    apiClient.patch<ApiResponse<MarketplaceOrder>>(`/orders/${encodeURIComponent(id)}/status`, { status, sellerNote }),
};

export type MarketplaceOrderPage = { items: MarketplaceOrder[]; meta: PaginationMeta };
