import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';

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

export type ServiceQuoteListItem = {
  id: string;
  broadcastId: string;
  price: string;
  message: string | null;
  status: string;
  createdAt: string;
  broadcast?: { id: string; title: string; status: string };
};

export const serviceBroadcastsApi = {
  getOpenFeed: (params?: { page?: number; limit?: number; categoryId?: string; city?: string }) =>
    apiClient.get<ApiResponse<ServiceBroadcastListItem[]>>('/service-broadcasts', { params }),

  getMyBroadcasts: (params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<ServiceBroadcastListItem[]>>('/service-broadcasts/me', { params }),

  getMyQuotes: (params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<ServiceQuoteListItem[]>>('/service-broadcasts/quotes/me', { params }),

  getById: (id: string) =>
    apiClient.get<ApiResponse<ServiceBroadcastListItem & { quotes?: ServiceQuoteListItem[] }>>(
      `/service-broadcasts/${id}`,
    ),

  create: (body: {
    categoryId: string;
    title: string;
    description: string;
    city?: string;
    attachedImages?: string[];
  }) => apiClient.post<ApiResponse<ServiceBroadcastListItem>>('/service-broadcasts', body),

  submitQuote: (
    broadcastId: string,
    body: { price: number; message?: string; durationEstimate?: string },
  ) =>
    apiClient.post<ApiResponse<ServiceQuoteListItem>>(
      `/service-broadcasts/${broadcastId}/quotes`,
      body,
    ),
};
