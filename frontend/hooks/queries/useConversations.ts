'use client';

import { useQuery } from '@tanstack/react-query';
import { conversationsApi } from '@/api/conversations.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { pollingInterval } from '@/lib/polling';
import type { ConversationsQuery, MessagesQuery } from '@/types/conversation.types';
import {
  saveConversationsList,
  getConversationsList,
  saveMessagesForConversation,
  getMessagesForConversation,
  saveUnreadConversationCount,
  getUnreadConversationCount,
} from '@/lib/offlineMessagesStore';
import type { PaginationMeta } from '@/types/api.types';

function offlineMeta(count: number): PaginationMeta {
  return {
    total: count,
    page: 1,
    limit: count,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  };
}

/** GET /conversations — مع تخزين IndexedDB للقراءة دون اتصال. */
export function useMyConversations(params?: ConversationsQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.conversations.mine(params),
    queryFn: async () => {
      try {
        const data = await conversationsApi.getMine(params).then((r) => r.data.data);
        // احفظ دائمًا عند نجاح الشبكة — بما فيها القائمة الفارغة —
        // حتى لا تبقى محادثات محذوفة ظاهرة أوفلاين (FIX OFFLINE-MSG-EMPTY-01).
        if (data?.items) {
          void saveConversationsList(data.items);
        }
        return data;
      } catch (err) {
        const cached = await getConversationsList();
        if (cached.length > 0) {
          return { items: cached, meta: offlineMeta(cached.length) };
        }
        throw err;
      }
    },
    staleTime: CACHE_TTL.conversations,
    refetchInterval: () => pollingInterval(CACHE_TTL.conversations, 3),
    // أونلاين: فقط مع توكن. أوفلاين: شغّل queryFn لإرجاع الكاش المحلي.
    enabled: isAuthenticated && (hasToken || !isOnline),
  });
}

/** GET /conversations/:id — single thread metadata (participants, ad). */
export function useConversation(id: string) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.conversations.detail(id),
    queryFn: async () => {
      try {
        return await conversationsApi.getById(id).then((r) => r.data.data);
      } catch (err) {
        const list = await getConversationsList();
        const hit = list.find((c) => c.id === id);
        if (hit) return hit;
        throw err;
      }
    },
    staleTime: CACHE_TTL.conversations,
    enabled: isAuthenticated && Boolean(id) && (hasToken || !isOnline),
  });
}

/**
 * GET /conversations/:id/messages — مع IndexedDB للرسائل السابقة offline.
 * الترتيب المعروض تصاعدي (أقدم → أحدث) كما كان.
 */
export function useMessages(conversationId: string, params?: MessagesQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.conversations.messages(conversationId, params),
    queryFn: async () => {
      try {
        const data = await conversationsApi
          .getMessages(conversationId, params)
          .then((r) => {
            const payload = r.data.data ?? {
              items: [],
              meta: offlineMeta(0),
            };
            return { ...payload, items: [...payload.items].reverse() };
          });
        // حفظ حتى القائمة الفارغة لمسح رسائل محلّية قديمة بعد الحذف من السيرفر.
        void saveMessagesForConversation(conversationId, data.items);
        return data;
      } catch (err) {
        const cached = await getMessagesForConversation(conversationId);
        if (cached && cached.length > 0) {
          return { items: cached, meta: offlineMeta(cached.length) };
        }
        throw err;
      }
    },
    staleTime: CACHE_TTL.messages,
    refetchInterval: () => pollingInterval(CACHE_TTL.messages, 6),
    enabled: isAuthenticated && Boolean(conversationId) && (hasToken || !isOnline),
  });
}

/** GET /conversations/unread-count — badge + تخزين محلي. */
export function useUnreadConversationCount() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.conversations.unreadCount(),
    queryFn: async () => {
      try {
        const count = await conversationsApi
          .getUnreadCount()
          .then((r) => r.data.data?.count ?? 0);
        void saveUnreadConversationCount(count);
        return count;
      } catch (err) {
        const cached = await getUnreadConversationCount();
        if (cached != null) return cached;
        throw err;
      }
    },
    staleTime: CACHE_TTL.conversationUnreadCount ?? CACHE_TTL.conversations,
    refetchInterval: () =>
      pollingInterval(CACHE_TTL.conversationUnreadCount ?? CACHE_TTL.conversations, 3),
    enabled: isAuthenticated && (hasToken || !isOnline),
  });
}
