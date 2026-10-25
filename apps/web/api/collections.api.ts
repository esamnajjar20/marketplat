/**
 * Store collections API — maps to backend /api/v1/collections/*
 * endpoints. Verified against collections.routes.ts /
 * collections.controller.ts directly:
 *   - /me and /reorder are single-segment literal paths registered
 *     before /:id on the backend, so they're never swallowed as an
 *     :id param — same convention as promotions.api.ts's getMine().
 *   - The two public storefront reads (/store/:storeId,
 *     /:id/products) take no auth and accept a store id-or-slug the
 *     same way stores.api.ts's getById does.
 */
import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type {
  StoreCollection,
  StoreCollectionWithCount,
  CreateCollectionPayload,
  UpdateCollectionPayload,
  ReorderCollectionsPayload,
  CollectionProducts,
} from '@/types/collection.types';

export const collectionsApi = {
  /** POST /collections */
  create: (payload: CreateCollectionPayload) =>
    apiClient.post<ApiResponse<StoreCollection>>('/collections', payload),

  /** GET /collections/me — caller's own store's collections, owner view (includes inactive). */
  getMine: () => apiClient.get<ApiResponse<StoreCollectionWithCount[]>>('/collections/me'),

  /** GET /collections/:id — owner-only single-collection read. */
  getById: (id: string) => apiClient.get<ApiResponse<StoreCollection>>(`/collections/${id}`),

  /** PATCH /collections/:id */
  update: (id: string, payload: UpdateCollectionPayload) =>
    apiClient.patch<ApiResponse<StoreCollection>>(`/collections/${id}`, payload),

  /** DELETE /collections/:id — hard delete; memberships cascade. */
  delete: (id: string) => apiClient.delete<ApiResponse<null>>(`/collections/${id}`),

  /** PATCH /collections/reorder — full ordered id list, must match the store's collections exactly. */
  reorder: (payload: ReorderCollectionsPayload) =>
    apiClient.patch<ApiResponse<null>>('/collections/reorder', payload),

  /** POST /collections/:id/products/:productId */
  addProduct: (id: string, productId: string) =>
    apiClient.post<ApiResponse<null>>(`/collections/${id}/products/${productId}`),

  /** DELETE /collections/:id/products/:productId */
  removeProduct: (id: string, productId: string) =>
    apiClient.delete<ApiResponse<null>>(`/collections/${id}/products/${productId}`),

  // --- Public ---

  /** GET /collections/store/:storeId — active collections only, public storefront tab. */
  getPublicCollections: (storeId: string) =>
    apiClient.get<ApiResponse<StoreCollectionWithCount[]>>(`/collections/store/${storeId}`),

  /** GET /collections/:id/products — public, active products only. */
  getPublicCollectionProducts: (id: string) =>
    apiClient.get<ApiResponse<CollectionProducts>>(`/collections/${id}/products`),
};
