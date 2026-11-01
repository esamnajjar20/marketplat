import { useEffect } from 'react';
import { AppState } from 'react-native';

/** Sync the conversation media outbox on mount and when the app returns foreground. */
export function useChatMediaOutboxLifecycle(
  refresh: () => Promise<void>,
  flush: () => Promise<void>,
): void {
  useEffect(() => {
    void refresh();
    void flush();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flush();
    });
    return () => subscription.remove();
  }, [flush, refresh]);
}
