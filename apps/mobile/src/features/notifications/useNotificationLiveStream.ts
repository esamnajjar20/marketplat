import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { subscribeChatLiveStream } from '@/features/messaging/chat-live-stream';

type Options = {
  userId?: string;
  getToken: () => string | null | undefined;
  refreshList: () => Promise<void>;
  refreshUnreadCounts: () => Promise<void>;
};

/** Keeps the native notification list and unread badge in sync across devices. */
export function useNotificationLiveStream(options: Options): void {
  const { userId, getToken, refreshList, refreshUnreadCounts } = options;
  const lastEventIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | undefined>(undefined);
  const callbacksRef = useRef({ refreshList, refreshUnreadCounts });
  callbacksRef.current = { refreshList, refreshUnreadCounts };
  if (currentUserIdRef.current !== userId) {
    currentUserIdRef.current = userId;
    lastEventIdRef.current = null;
  }

  useFocusEffect(useCallback(() => {
    if (!userId || !getToken()) return undefined;
    let focused = true;
    let streamStop: (() => void) | null = null;
    let fallbackPoll: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const refresh = () => {
      if (!focused || AppState.currentState !== 'active') return;
      void callbacksRef.current.refreshList();
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
        getToken: () => getToken() ?? '',
        getLastEventId: () => lastEventIdRef.current,
        onEvent: (event, eventId) => {
          if (eventId) lastEventIdRef.current = eventId;
          if (event.type === 'notification' || event.type === 'resync') scheduleRefresh();
        },
        onUnsupported: startFallback,
      });
    };

    refresh();
    startStream();
    const appStateSubscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        if (fallbackPoll) {
          stopFallback();
          startFallback();
        } else {
          startStream();
        }
        refresh();
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
  }, [getToken, userId]));
}
