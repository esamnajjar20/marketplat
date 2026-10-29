import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/features/auth/AuthContext';
import { useIsOnline } from '@/lib/connectivity';
import { syncChatMessageOutbox, type ChatOutboxSyncSnapshot } from '@/features/messaging/chat-message-outbox-sync';
import { cleanupStaleChatMediaFiles } from '@/storage/chat-media-outbox';

/** Persisted chat messages sync when connectivity returns or the app resumes.
 *  Connectivity is provided by ConnectivityProvider (single NetInfo listener for the app). */
export function ChatMessageOutboxLifecycleBridge() {
  const { accessToken, csrfToken, user, isRestoring } = useAuth();
  const isOnline = useIsOnline();
  const latest = useRef<ChatOutboxSyncSnapshot>({ isOnline: false, token: null, ownerId: null, csrfToken: null });

  useEffect(() => { void cleanupStaleChatMediaFiles().catch(() => undefined); }, []);

  useEffect(() => {
    latest.current = { ...latest.current, token: accessToken, csrfToken, ownerId: user?.id ?? null, isOnline };
  }, [accessToken, csrfToken, user?.id, isOnline]);

  useEffect(() => {
    if (isRestoring || !isOnline) return;
    let stopped = false;
    let generation = 0;
    const sessionController = new AbortController();

    const trigger = async () => {
      if (stopped || AppState.currentState !== 'active') return;
      const current = ++generation;
      try {
        if (!latest.current.isOnline) return;
        await syncChatMessageOutbox({ ...latest.current, signal: sessionController.signal });
      } catch {
        // Queue rows remain durable; next connectivity/resume event retries.
      }
    };

    const appSubscription = AppState.addEventListener('change', (state) => { if (state === 'active') void trigger(); });
    void trigger();

    return () => { stopped = true; generation += 1; sessionController.abort(); appSubscription.remove(); };
  }, [isRestoring, isOnline, accessToken, csrfToken, user?.id]);

  return null;
}
