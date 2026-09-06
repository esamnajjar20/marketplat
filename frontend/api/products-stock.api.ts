import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { Product } from '@/types/product.types';

/** PATCH /products/:id/stock */
export const adjustProductStock = (id: string, stockQuantity: number | null) =>
  apiClient
    .patch<ApiResponse<Product>>(`/products/${id}/stock`, { stockQuantity })
    .then((r) => r.data.data);
