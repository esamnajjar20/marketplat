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
  }) => apiClient.get<ApiResponse<RequestListItem[]>>('/requests', { params }),

  getMyRequests: (params?: { page?: number; limit?: number; status?: string }) =>
    apiClient.get<ApiResponse<RequestListItem[]>>('/requests/me', { params }),

  getMyOffers: (params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<RequestOfferListItem[]>>('/requests/offers/me', { params }),

  getById: (id: string) => apiClient.get<ApiResponse<RequestDetail>>(`/requests/${id}`),

  create: (body: CreateRequestBody) =>
    apiClient.post<ApiResponse<RequestListItem>>('/requests', body),

  cancel: (id: string) => apiClient.patch<ApiResponse<RequestListItem>>(`/requests/${id}/cancel`),

  submitOffer: (id: string, body: SubmitOfferBody) =>
    apiClient.post<ApiResponse<RequestOfferListItem>>(`/requests/${id}/offers`, body),

  withdrawOffer: (id: string, offerId: string) =>
    apiClient.delete<ApiResponse<RequestOfferListItem>>(`/requests/${id}/offers/${offerId}`),

  acceptOffer: (id: string, offerId: string) =>
    apiClient.patch<ApiResponse<RequestListItem>>(`/requests/${id}/offers/${offerId}/accept`),
};
