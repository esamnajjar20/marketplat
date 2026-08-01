/**
 * Conversations API — maps to backend /api/v1/conversations/*.
 * Verified against conversations.routes.ts:
 *   - Every route requires auth — there is no public conversation view.
 *   - POST / is idempotent per (adId, caller, seller) triple: the
 *     backend reuses the existing thread instead of creating a
 *     duplicate (conversations.service.ts's startFromAd), so calling
 *     this again for the same ad just returns the same conversation.
 *   - GET /:id/messages both fetches a page of messages AND marks the
 *     caller's unread inbound messages as read as a side effect — see
 *     useMessages's own doc comment for why that's fine under polling.
 */
import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';
import type {
  Conversation,
  Message,
  StartConversationPayload,
  SendMessagePayload,
  ConversationsQuery,
  MessagesQuery,
} from '@/types/conversation.types';

export const conversationsApi = {
  /** GET /conversations — every thread the caller is a party to. */
  getMine: (params?: ConversationsQuery) =>
    apiClient
      .get<ApiResponse<Conversation[]>>('/conversations', { params })
      .then((r) => unwrapPaginated<Conversation>(r)),

  /** POST /conversations — start (or reopen) a thread about an ad. */
  start: (payload: StartConversationPayload) =>
    apiClient.post<ApiResponse<Conversation>>('/conversations', payload),

  /** GET /conversations/:id */
  getById: (id: string) =>
    apiClient.get<ApiResponse<Conversation>>(`/conversations/${id}`),

  /** GET /conversations/:id/messages — newest-first from the backend;
   * see useMessages for the chronological re-sort applied on top. */
  getMessages: (id: string, params?: MessagesQuery) =>
    apiClient
      .get<ApiResponse<Message[]>>(`/conversations/${id}/messages`, { params })
      .then((r) => unwrapPaginated<Message>(r)),

  /** POST /conversations/:id/messages */
  sendMessage: (id: string, payload: SendMessagePayload) =>
    apiClient.post<ApiResponse<Message>>(`/conversations/${id}/messages`, payload),
};
