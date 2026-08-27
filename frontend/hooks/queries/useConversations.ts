'use client';

import { useQuery } from '@tanstack/react-query';
import { conversationsApi } from '@/api/conversations.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { pollingInterval } from '@/lib/polling';
import type { ConversationsQuery, MessagesQuery } from '@/types/conversation.types';

/** GET /conversations — every thread the caller is a party to, most
 * recently active first. Polls at CACHE_TTL.conversations so a new
 * incoming thread (or a bump from a new message elsewhere) shows up
 * without a manual refresh — no WebSocket yet, see Epic 5's design note. */
export function useMyConversations(params?: ConversationsQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.conversations.mine(params),
    queryFn: () => conversationsApi.getMine(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.conversations,
    refetchInterval: () => pollingInterval(CACHE_TTL.conversations, 3),
    enabled: isAuthenticated,
  });
}

/** GET /conversations/:id — single thread metadata (participants, ad). */
export function useConversation(id: string) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.conversations.detail(id),
    queryFn: () => conversationsApi.getById(id).then((r) => r.data.data),
    staleTime: CACHE_TTL.conversations,
    enabled: isAuthenticated && Boolean(id),
  });
}

/**
 * GET /conversations/:id/messages — the backend returns newest-first
 * (cheap for pagination, matches every other list endpoint here), but a
 * chat thread reads top-to-bottom chronologically — this hook re-sorts
 * the single page of items it gets back into that order before handing
 * them to the component, so ChatWindow never has to think about it.
 * Polls faster than the conversation list (CACHE_TTL.messages, 5s) since
 * this is the one view where "did they just reply" actually matters
 * moment-to-moment — same faster-for-the-active-view idea as
 * availability's own shorter TTL relative to appointments.
 */
export function useMessages(conversationId: string, params?: MessagesQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.conversations.messages(conversationId, params),
    queryFn: () =>
      conversationsApi
        .getMessages(conversationId, params)
        .then((r) => {
          const data = r.data.data ?? {
            items: [],
            meta: { total: 0, page: 1, limit: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false },
          };
          return { ...data, items: [...data.items].reverse() };
        }),
    staleTime: CACHE_TTL.messages,
    // When SSE is up, live message:new updates the cache — poll only as backup.
    // SSE delivers message:new; poll is backup only (longer when stream is up).
    refetchInterval: () => pollingInterval(CACHE_TTL.messages, 6),
    enabled: isAuthenticated && Boolean(conversationId),
  });
}

/** GET /conversations/unread-count — powers the nav messages badge. */
export function useUnreadConversationCount() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.conversations.unreadCount(),
    queryFn: () => conversationsApi.getUnreadCount().then((r) => r.data.data?.count ?? 0),
    staleTime: CACHE_TTL.conversationUnreadCount ?? CACHE_TTL.conversations,
    refetchInterval: () =>
      pollingInterval(CACHE_TTL.conversationUnreadCount ?? CACHE_TTL.conversations, 3),
    enabled: isAuthenticated,
  });
}
