import { apiClient } from './client';
import type { ApiResponse, PaginationMeta } from '@/types/api.types';
import type { Product } from '@/types/product.types';

export interface StockSummary {
  totalProducts: number;
  trackedProducts: number;
  untrackedProducts: number;
  inStock: number;
  limited: number;
  outOfStock: number;
  totalUnits: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  changedByUserId: string;
  previousQuantity: number | null;
  newQuantity: number | null;
  delta: number | null;
  reason: string;
  createdAt: string;
  product: { name: string };
}

/** PATCH /products/:id/stock */
export const adjustProductStock = (
  id: string,
  stockQuantity: number | null,
  reason?: string,
) =>
  apiClient
    .patch<ApiResponse<Product>>(`/products/${id}/stock`, {
      stockQuantity,
      ...(reason ? { reason } : {}),
    })
    .then((r) => r.data.data);

export const getStockSummary = () =>
  apiClient
    .get<ApiResponse<StockSummary>>('/products/stock/summary')
    .then((r) => r.data.data);

export const getStockHistory = (params?: { page?: number; limit?: number; productId?: string }) =>
  apiClient
    .get<ApiResponse<StockMovement[]>>('/products/stock/history', { params })
    .then((r) => ({
      items: r.data.data,
      meta: r.data.meta?.pagination as PaginationMeta | undefined,
    }));
