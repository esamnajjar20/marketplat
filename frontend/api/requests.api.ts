import { apiClient } from './client';
import type { AxiosRequestConfig } from 'axios';
import { mediaApi } from './media.api';
import type { ApiResponse } from '@/types/api.types';
import type {
  RequestDetail,
  RequestListItem,
  RequestOfferListItem,
  RequestType,
  RequestOfferStatus,
} from '@/types/request.types';

export type CreateRequestBody = {
  type: RequestType;
  categoryId: string;
  serviceTypeId?: string;
  title: string;
  description: string;
  city?: string;
  attachedImages?: string[];
  directImagePublicIds?: string[];
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
    serviceTypeId?: string;
    city?: string;
    q?: string;
    /** Server-side sort — newest | expiring | budget_high | fewest_offers */
    sort?: 'newest' | 'expiring' | 'budget_high' | 'fewest_offers';
  }, config?: AxiosRequestConfig) => apiClient.get<ApiResponse<RequestListItem[]>>('/requests', { ...config, params }),

  getMyRequests: (params?: { page?: number; limit?: number; status?: string }, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<RequestListItem[]>>('/requests/me', { ...config, params }),

  getMyOffers: (params?: { page?: number; limit?: number; status?: RequestOfferStatus }, config?: AxiosRequestConfig) =>
    apiClient.get<ApiResponse<RequestOfferListItem[]>>('/requests/offers/me', { ...config, params }),

  getById: (id: string, config?: AxiosRequestConfig) => (config ? apiClient.get<ApiResponse<RequestDetail>>(`/requests/${id}`, config) : apiClient.get<ApiResponse<RequestDetail>>(`/requests/${id}`)),

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

  /**
   * Upload request images directly to Cloudinary using server-issued,
   * purpose-bound intents. The create endpoint receives public IDs and
   * consumes them in the same PostgreSQL transaction as the request row.
   * Local File[] values remain available to the offline draft retry path.
   */

  createWithImages: async (
    body: CreateRequestBody,
    files: File[] | undefined,
    operationId?: string,
  ) => {
    let directImagePublicIds = body.directImagePublicIds;
    if (files && files.length > 0) {
      directImagePublicIds = await mediaApi.uploadImages(files);
    }
    return requestsApi.create({ ...body, directImagePublicIds }, operationId);
  },

  withdrawOffer: (id: string, offerId: string) =>
    apiClient.delete<ApiResponse<RequestOfferListItem>>(`/requests/${id}/offers/${offerId}`),

  acceptOffer: (id: string, offerId: string) =>
    apiClient.patch<ApiResponse<RequestListItem & { conversationId?: string }>>(`/requests/${id}/offers/${offerId}/accept`),
};
