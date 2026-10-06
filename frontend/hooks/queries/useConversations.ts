'use client';

import { useQuery } from '@tanstack/react-query';
import { conversationsApi } from '@/api/conversations.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
  selectUser,
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
import { offlineMeta } from '@/lib/apiPagination';
import { saveConversationMedia, getConversationMedia, cacheConversationMediaBlobs } from '@/lib/conversationMediaStore';

export function useMyConversations(params?: ConversationsQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const userId = useAuthStore(selectUser)?.id ?? null;
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.conversations.mine(params),
    queryFn: async () => {
      try {
        const data = await conversationsApi.getMine(params).then((r) => r.data.data);
        // احفظ دائمًا عند نجاح الشبكة — بما فيها القائمة الفارغة —
        // حتى لا تبقى محادثات محذوفة ظاهرة أوفلاين (FIX OFFLINE-MSG-EMPTY-01).
        if (data?.items) {
          // FIX MSG-STORE-USER-PASS-MY-CONV-SAVE-01: userId passed so
          // the store's write-side user check actually runs.
          void saveConversationsList(data.items, userId);
        }
        return data;
      } catch (err) {
        const cached = await getConversationsList(userId);
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
  const userId = useAuthStore(selectUser)?.id ?? null;
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.conversations.detail(id),
    queryFn: async () => {
      try {
        return await conversationsApi.getById(id).then((r) => r.data.data);
      } catch (err) {
        // FIX MSG-STORE-USER-PASS-CONV-DETAIL-01: userId passed so the
        // store's read-side user check actually runs.
        const list = await getConversationsList(userId);
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
export function useConversationMedia(conversationId: string, enabled = true) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const userId = useAuthStore(selectUser)?.id ?? null;
  const isOnline = useOnlineStatus();
  return useQuery({
    queryKey: [...queryKeys.conversations.detail(conversationId), 'media'],
    queryFn: async () => {
      try {
        const items = await conversationsApi.getMedia(conversationId, 100).then((r) => r.data.data ?? []);
        if (userId) {
          void saveConversationMedia(userId, conversationId, items).catch(() => undefined);
          void cacheConversationMediaBlobs(userId, conversationId, items).catch(() => undefined);
        }
        return items;
      } catch (error) {
        if (userId) {
          const cached = await getConversationMedia(userId, conversationId).catch(() => []);
          if (cached.length) return cached;
        }
        throw error;
      }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: enabled && isAuthenticated && Boolean(conversationId) && (hasToken || !isOnline),
  });
}

export function useMessages(conversationId: string, params?: MessagesQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const userId = useAuthStore(selectUser)?.id ?? null;
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
        // FIX MSG-STORE-USER-PASS-MESSAGES-SAVE-01: userId passed so
        // the store's write-side user check actually runs.
        // حفظ حتى القائمة الفارغة لمسح رسائل محلّية قديمة بعد الحذف من السيرفر.
        void saveMessagesForConversation(conversationId, data.items, userId);
        return data;
      } catch (err) {
        // FIX MSG-STORE-USER-PASS-MESSAGES-GET-01: userId passed to the
        // read so the store's read-side user check actually runs.
        const cached = await getMessagesForConversation(conversationId, userId);
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
  const userId = useAuthStore(selectUser)?.id ?? null;
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: queryKeys.conversations.unreadCount(),
    queryFn: async () => {
      try {
        const count = await conversationsApi
          .getUnreadCount()
          .then((r) => r.data.data?.count ?? 0);
        // FIX MSG-STORE-USER-PASS-UNREAD-SAVE-01: userId passed so the
        // store's write-side user check actually runs.
        void saveUnreadConversationCount(count, userId);
        return count;
      } catch (err) {
        // FIX MSG-STORE-USER-PASS-UNREAD-GET-01: userId passed on read too.
        const cached = await getUnreadConversationCount(userId);
        if (cached != null) return cached;
        throw err;
      }
    },
    // FIX CONV-TTL-FALLBACK-CLEANUP-01: was
    // CACHE_TTL.conversationUnreadCount ?? CACHE_TTL.conversations.
    // conversationUnreadCount is a real constant (15_000) --
    // the ?? could only fire if someone renamed/deleted it,
    // silently falling back to a different semantic TTL.
    staleTime: CACHE_TTL.conversationUnreadCount,
    refetchInterval: () =>
      pollingInterval(CACHE_TTL.conversationUnreadCount, 3),
    // HYDRATION-DEDUP: ProtectedSidebar and MessagesLink (desktop) and
    // BottomNav (mobile) all mount this hook on protected routes.
    // Without this flag each one fetched independently before the cache
    // had a value, showing unread-count x2 on every load. The
    // refetchInterval below still refreshes the value periodically; the
    // /notifications SSE channel still invalidates on new messages.
    refetchOnMount: false,
    enabled: isAuthenticated && (hasToken || !isOnline),
  });
}
