import { apiClient } from './client';
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
    /** Server-side sort — newest | expiring | budget_high | fewest_offers */
    sort?: 'newest' | 'expiring' | 'budget_high' | 'fewest_offers';
  }) => apiClient.get<ApiResponse<RequestListItem[]>>('/requests', { params }),

  getMyRequests: (params?: { page?: number; limit?: number; status?: string }) =>
    apiClient.get<ApiResponse<RequestListItem[]>>('/requests/me', { params }),

  getMyOffers: (params?: { page?: number; limit?: number; status?: RequestOfferStatus }) =>
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

  /**
   * FIX REQ-IMAGE-OFFLINE-01: a compound helper that mirrors what the
   * other three create flows (ads/products/services) get for free
   * from their multipart endpoints. /requests accepts JSON only —
   * the backend controller does not mount multer, and the schema's
   * `attachedImages: string[]` is a list of already-uploaded URLs —
   * so callers that want to attach images MUST first POST them to
   * /media/images. Doing that inside this helper (instead of at the
   * form layer, which is where it used to live) is what closes the
   * offline gap: the upload step now runs inside the mutation's own
   * try/catch, so a network failure there goes through the same
   * onError → saveAdDraft → offlineDraftPublisher path that ads and
   * products already use, and the picked File[]s get stashed as
   * publishFiles for a later retry.
   */
  createWithImages: async (
    body: CreateRequestBody,
    files: File[] | undefined,
    operationId?: string,
  ) => {
    let attachedImages = body.attachedImages;
    if (files && files.length > 0) {
      const res = await mediaApi.uploadImages(files);
      attachedImages = (res.data.data ?? []).map((x: { url: string }) => x.url);
    }
    return requestsApi.create({ ...body, attachedImages }, operationId);
  },

  withdrawOffer: (id: string, offerId: string) =>
    apiClient.delete<ApiResponse<RequestOfferListItem>>(`/requests/${id}/offers/${offerId}`),

  acceptOffer: (id: string, offerId: string) =>
    apiClient.patch<ApiResponse<RequestListItem & { conversationId?: string }>>(`/requests/${id}/offers/${offerId}/accept`),
};
