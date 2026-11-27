import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { subscribeChatLiveStream } from '@/features/messaging/chat-live-stream';
import { discardChatMessagesForConversation } from '@/storage/chat-message-outbox';
import { discardChatMediaForConversation } from '@/storage/chat-media-outbox';
import { clearCachedChatMessagesForConversation } from '@/storage/chat-message-cache';

type Options = {
  userId?: string;
  getToken: () => string | null | undefined;
  refreshInbox: () => Promise<void>;
  refreshUnreadCounts: () => Promise<void>;
};

/** Keeps the native conversation list and unread badge in sync while the inbox is focused. */
export function useChatInboxLiveStream(options: Options): void {
  const { userId, getToken, refreshInbox, refreshUnreadCounts } = options;
  const lastEventIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | undefined>(undefined);
  const callbacksRef = useRef({ getToken, refreshInbox, refreshUnreadCounts });
  callbacksRef.current = { getToken, refreshInbox, refreshUnreadCounts };

  if (currentUserIdRef.current !== userId) {
    currentUserIdRef.current = userId;
    lastEventIdRef.current = null;
  }

  useFocusEffect(useCallback(() => {
    if (!userId || !callbacksRef.current.getToken()) return undefined;
    let focused = true;
    let streamStop: (() => void) | null = null;
    let fallbackPoll: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (!focused || AppState.currentState !== 'active') return;
      void callbacksRef.current.refreshInbox();
      void callbacksRef.current.refreshUnreadCounts();
    };
    const scheduleRefresh = () => {
      if (!focused || refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refresh();
      }, 180);
    };
    const stopFallback = () => {
      if (fallbackPoll) clearInterval(fallbackPoll);
      fallbackPoll = null;
    };
    const stopStream = () => {
      streamStop?.();
      streamStop = null;
    };
    const startFallback = () => {
      if (!focused || AppState.currentState !== 'active' || fallbackPoll) return;
      refresh();
      fallbackPoll = setInterval(refresh, 30_000);
    };
    const startStream = () => {
      stopStream();
      if (!focused || AppState.currentState !== 'active') return;
      streamStop = subscribeChatLiveStream({
        token: '',
        getToken: () => callbacksRef.current.getToken() ?? '',
        getLastEventId: () => lastEventIdRef.current,
        onEvent: (event, eventId) => {
          if (eventId) lastEventIdRef.current = eventId;
          if (event.type === 'conversation:updated' && event.action === 'deleted' && userId && event.conversationId) {
            // A per-user delete must also cancel unsent offline work, otherwise
            // a later reconnect can retry against a conversation the user hid.
            void Promise.all([
              clearCachedChatMessagesForConversation(userId, event.conversationId),
              discardChatMessagesForConversation(userId, event.conversationId),
              discardChatMediaForConversation(userId, event.conversationId),
            ]).catch(() => undefined);
          }
          if (
            event.type === 'message:new' ||
            event.type === 'message:deleted' ||
            event.type === 'message:read' ||
            event.type === 'conversation:updated' ||
            event.type === 'resync'
          ) scheduleRefresh();
        },
        onUnsupported: startFallback,
      });
    };

    // The screen's own focus lifecycle performs the initial REST load. Avoid
    // issuing a duplicate inbox/count request merely because SSE is attached.
    startStream();
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        if (fallbackPoll) {
          stopFallback();
          startFallback();
        } else {
          startStream();
          refresh();
        }
      } else {
        stopStream();
        stopFallback();
      }
    });

    return () => {
      focused = false;
      stopStream();
      stopFallback();
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = null;
      appStateSubscription.remove();
    };
  }, [userId]));
}
