import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';
import type { ServiceQuoteStatus } from '@/types/service.types';

/** Lightweight shapes — backend returns richer relations when present. */
export type ServiceBroadcastListItem = {
  id: string;
  title: string;
  description: string;
  city: string | null;
  status: string;
  createdAt: string;
  categoryId: string;
};

/** The provider info the customer needs to identify who quoted and
 * a provider needs to identify their own quote — mirrors
 * service-broadcasts.repository.ts's broadcastWithRelations include. */
export type QuoteProvider = {
  id: string;
  sellerProfile: {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    verified: boolean;
  };
};

export type ServiceQuoteListItem = {
  id: string;
  broadcastId: string;
  price: string;
  message: string | null;
  durationEstimate: string | null;
  status: ServiceQuoteStatus;
  createdAt: string;
  broadcast?: { id: string; title: string; status: string };
  provider?: QuoteProvider;
};

/** Detail payload — includes customerId (for "is this my broadcast"
 * checks) and the full quotes list (see service-broadcasts.service.ts's
 * getById doc comment: quotes are always visible on a broadcast's own
 * detail view, unlike a single private ServiceRequest). */
export type ServiceBroadcastDetail = ServiceBroadcastListItem & {
  customerId: string;
  quotes?: ServiceQuoteListItem[];
};

export const serviceBroadcastsApi = {
  getOpenFeed: (params?: { page?: number; limit?: number; categoryId?: string; city?: string }) =>
    apiClient.get<ApiResponse<ServiceBroadcastListItem[]>>('/service-broadcasts', { params }),

  getMyBroadcasts: (params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<ServiceBroadcastListItem[]>>('/service-broadcasts/me', { params }),

  getMyQuotes: (params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<ServiceQuoteListItem[]>>('/service-broadcasts/quotes/me', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<ServiceBroadcastDetail>>(`/service-broadcasts/${id}`),

  create: (body: {
    categoryId: string;
    title: string;
    description: string;
    city?: string;
    attachedImages?: string[];
  }) => apiClient.post<ApiResponse<ServiceBroadcastListItem>>('/service-broadcasts', body),

  cancel: (id: string) =>
    apiClient.patch<ApiResponse<ServiceBroadcastListItem>>(`/service-broadcasts/${id}/cancel`),

  submitQuote: (
    broadcastId: string,
    body: { price: number; message?: string; durationEstimate?: string },
  ) =>
    apiClient.post<ApiResponse<ServiceQuoteListItem>>(
      `/service-broadcasts/${broadcastId}/quotes`,
      body,
    ),

  /** Provider withdraws their own PENDING quote. Endpoint has existed on
   * the backend (DELETE /:id/quotes/:quoteId) since this feature shipped
   * but had no frontend caller until now. */
  withdrawQuote: (broadcastId: string, quoteId: string) =>
    apiClient.delete<ApiResponse<ServiceQuoteListItem>>(
      `/service-broadcasts/${broadcastId}/quotes/${quoteId}`,
    ),

  /** Customer accepts a quote on their own OPEN broadcast. Endpoint has
   * existed on the backend (PATCH /:id/quotes/:quoteId/accept) since this
   * feature shipped but had no frontend caller until now. */
  acceptQuote: (broadcastId: string, quoteId: string) =>
    apiClient.patch<ApiResponse<ServiceBroadcastListItem>>(
      `/service-broadcasts/${broadcastId}/quotes/${quoteId}/accept`,
    ),
};
