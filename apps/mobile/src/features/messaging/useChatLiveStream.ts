import { useCallback } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { subscribeChatLiveStream, type ChatLiveEvent } from '@/features/messaging/chat-live-stream';

export type ChatLiveStreamOptions = {
  id?: string;
  userId?: string;
  getToken: () => string | null | undefined;
  getLastEventId: () => string | null;
  setLastEventId: (value: string) => void;
  load: () => Promise<void>;
  refreshLatestMessages: () => Promise<void>;
  onEvent: (event: ChatLiveEvent) => void;
};

/** Owns the focused chat SSE connection and the REST fallback lifecycle. */
export function useChatLiveStream(options: ChatLiveStreamOptions): void {
  const { id, userId, getToken, getLastEventId, setLastEventId, load, refreshLatestMessages, onEvent } = options;

  useFocusEffect(useCallback(() => {
    void load();
    if (!getToken() || !id || !userId) return undefined;
    let focused = true;
    let streamStop: (() => void) | null = null;
    let fallbackPoll: ReturnType<typeof setInterval> | null = null;
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
      void refreshLatestMessages();
      fallbackPoll = setInterval(() => {
        if (focused && AppState.currentState === 'active') void refreshLatestMessages();
      }, 30_000);
    };
    const startStream = () => {
      stopStream();
      if (!focused || AppState.currentState !== 'active') return;
      streamStop = subscribeChatLiveStream({
        token: '',
        getToken: () => getToken() ?? '',
        getLastEventId,
        onEvent: (event, eventId) => {
          if (eventId) setLastEventId(eventId);
          onEvent(event);
        },
        onUnsupported: startFallback,
      });
    };

    startStream();
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (fallbackPoll) { stopFallback(); startFallback(); }
        else startStream();
        void refreshLatestMessages();
      } else {
        stopStream();
        stopFallback();
      }
    });

    return () => {
      focused = false;
      stopStream();
      stopFallback();
      appStateSubscription.remove();
    };
  }, [getLastEventId, getToken, id, load, onEvent, refreshLatestMessages, setLastEventId, userId]));
}
