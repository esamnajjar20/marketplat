import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type {
  RequestDetail,
  RequestListItem,
  RequestOfferListItem,
  RequestType,
} from '@/types/request.types';

export type CreateRequestBody = {
  type: RequestType;
  categoryId: string;
  title: string;
  description: string;
  city?: string;
  attachedImages?: string[];
  budgetMin?: number;
  budgetMax?: number;
  attributes?: Record<string, unknown>;
  expiresInDays?: number;
};

export type SubmitOfferBody = {
  price: number;
  message?: string;
  meta?: Record<string, unknown>;
};

export const requestsApi = {
  getOpenFeed: (params?: {
    page?: number;
    limit?: number;
    type?: RequestType;
    categoryId?: string;
    city?: string;
    q?: string;
  }) => apiClient.get<ApiResponse<RequestListItem[]>>('/requests', { params }),

  getMyRequests: (params?: { page?: number; limit?: number; status?: string }) =>
    apiClient.get<ApiResponse<RequestListItem[]>>('/requests/me', { params }),

  getMyOffers: (params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<RequestOfferListItem[]>>('/requests/offers/me', { params }),

  getById: (id: string) => apiClient.get<ApiResponse<RequestDetail>>(`/requests/${id}`),

  create: (body: CreateRequestBody, operationId?: string) =>
    // FIX REQ-OPID-01: X-Offline-Op-Id matches the header that sw.js's
    // handleMutation reads to link a queued entry to its local draft
    // (entry.operationId). Without it, a create-request that goes
    // through the SW queue stores operationId:null and
    // listQueuedOperationIds() can't return it — so offlineDraftPublisher
    // sees no overlap between "draft.operationId" and the SW queue and
    // re-sends the same request, producing a duplicate on the server.
    // Same convention as adsApi.create / productsApi.create /
    // serviceListingsApi.create already use.
    apiClient.post<ApiResponse<RequestListItem>>('/requests', body, {
      headers: operationId ? { 'X-Offline-Op-Id': operationId } : undefined,
    }),

  cancel: (id: string) => apiClient.patch<ApiResponse<RequestListItem>>(`/requests/${id}/cancel`),

  submitOffer: (id: string, body: SubmitOfferBody) =>
    apiClient.post<ApiResponse<RequestOfferListItem>>(`/requests/${id}/offers`, body),

  withdrawOffer: (id: string, offerId: string) =>
    apiClient.delete<ApiResponse<RequestOfferListItem>>(`/requests/${id}/offers/${offerId}`),

  acceptOffer: (id: string, offerId: string) =>
    apiClient.patch<ApiResponse<RequestListItem & { conversationId?: string }>>(`/requests/${id}/offers/${offerId}/accept`),
};
