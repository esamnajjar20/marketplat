import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@/features/auth/AuthContext';
import { syncChatMessageOutbox, type ChatOutboxSyncSnapshot } from '@/features/messaging/chat-message-outbox-sync';


/** Persisted chat messages sync when connectivity returns or the app resumes. */
export function ChatMessageOutboxLifecycleBridge() {
  const { accessToken, csrfToken, user, isRestoring } = useAuth();
  const latest = useRef<ChatOutboxSyncSnapshot>({ isOnline: false, token: null, ownerId: null, csrfToken: null });

  useEffect(() => {
    latest.current = { ...latest.current, token: accessToken, csrfToken, ownerId: user?.id ?? null };
  }, [accessToken, csrfToken, user?.id]);

  useEffect(() => {
    if (isRestoring) return;
    let stopped = false;
    let generation = 0;
    const sessionController = new AbortController();
    
    const trigger = async () => {
      if (stopped || AppState.currentState !== 'active') return;
      const current = ++generation;
      try {
        const state = await NetInfo.fetch();
        // هنا التعديل: إذا كان isInternetReachable غير معروف (null)، نعتبره متصلاً ونحاول
        latest.current = { ...latest.current, isOnline: state.isConnected === true && state.isInternetReachable !== false };
        if (stopped || current !== generation || !latest.current.isOnline) return;
        await syncChatMessageOutbox({ ...latest.current, signal: sessionController.signal });
      } catch {
        // Queue rows remain durable; the next connectivity/resume event retries them.
      }
    };

    const appSubscription = AppState.addEventListener('change', (state) => { if (state === 'active') void trigger(); });
    
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      latest.current = { ...latest.current, isOnline: state.isConnected === true && state.isInternetReachable !== false };
      if (latest.current.isOnline) void trigger();
    });
    
    void trigger();
    
    return () => { stopped = true; generation += 1; sessionController.abort(); appSubscription.remove(); unsubscribeNet(); };
  }, [isRestoring, accessToken, csrfToken, user?.id]);

  return null;
}
