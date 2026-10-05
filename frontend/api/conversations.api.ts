/**
 * Conversations API — maps to backend /api/v1/conversations/*.
 */
import { apiClient } from './client';
import { OFFLINE_OP_ID_HEADER, newOfflineOperationId } from '@/lib/offlineOperationId';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
import type {
  Conversation,
  ConversationListItem,
  Message,
  StartConversationPayload,
  SendMessagePayload,
  ConversationsQuery,
  MessagesQuery,
} from '@/types/conversation.types';

export const conversationsApi = {
  getMine: (params?: ConversationsQuery) =>
    apiClient
      .get<ApiResponse<ConversationListItem[]>>('/conversations', { params })
      .then((r) => unwrapPaginated<ConversationListItem>(r)),

  getUnreadCount: () =>
    apiClient.get<ApiResponse<{ count: number }>>('/conversations/unread-count'),

  start: (payload: StartConversationPayload) =>
    apiClient.post<ApiResponse<Conversation>>('/conversations', payload),

  getById: (id: string) =>
    apiClient.get<ApiResponse<Conversation>>(`/conversations/${id}`),

  getMedia: (id: string, limit = 100) =>
    apiClient.get<ApiResponse<Message[]>>(`/conversations/${id}/messages/media`, { params: { limit }}),

  getMessages: (id: string, params?: MessagesQuery) =>
    apiClient
      .get<ApiResponse<Message[]>>(`/conversations/${id}/messages`, { params })
      .then((r) => unwrapPaginated<Message>(r)),

  sendMessage: (id: string, payload: SendMessagePayload) =>
    apiClient.post<ApiResponse<Message>>(`/conversations/${id}/messages`, payload, {
      headers: { [OFFLINE_OP_ID_HEADER]: newOfflineOperationId() },
    }),

  deleteMessage: (conversationId: string, messageId: string) =>
    apiClient.delete<ApiResponse<Message>>(
      `/conversations/${conversationId}/messages/${messageId}`
    ),

  pinMessage: (id: string, messageId: string) => apiClient.post<ApiResponse<void>>(`/conversations/${id}/messages/${messageId}/pin`),
  unpinMessage: (id: string, messageId: string) => apiClient.delete<ApiResponse<void>>(`/conversations/${id}/messages/${messageId}/pin`),
  starMessage: (id: string, messageId: string) => apiClient.post<ApiResponse<void>>(`/conversations/${id}/messages/${messageId}/star`),
  unstarMessage: (id: string, messageId: string) => apiClient.delete<ApiResponse<void>>(`/conversations/${id}/messages/${messageId}/star`),

  setFlags: (id: string, flags: { pinned?: boolean; archived?: boolean }) =>
    apiClient.patch<ApiResponse<Conversation>>(`/conversations/${id}/flags`, flags),

  sendAudio: (id: string, file: File, body?: string) => {
    const form = new FormData();
    form.append('audio', file);
    if (body?.trim()) form.append('body', body.trim());
    return apiClient.post<ApiResponse<Message>>(`/conversations/${id}/messages/audio`, form, {
      headers: { [OFFLINE_OP_ID_HEADER]: newOfflineOperationId() },
    });
  },

  signalTyping: (id: string, isTyping: boolean) =>
    apiClient.post<ApiResponse<void>>(`/conversations/${id}/typing`, { isTyping }),
};
