import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { fetchUnreadCounts } from '@/features/messaging/messaging.api';
import { useAuth } from '@/features/auth/AuthContext';

export type UnreadCounts = { messages: number; notifications: number };

export function useUnreadCounts() {
  const { accessToken } = useAuth();
  const [counts, setCounts] = useState<UnreadCounts>({ messages: 0, notifications: 0 });
  const sequence = useRef(0);

  const refresh = useCallback(async () => {
    const currentSequence = ++sequence.current;
    if (!accessToken) {
      setCounts({ messages: 0, notifications: 0 });
      return;
    }
    try {
      const next = await fetchUnreadCounts(accessToken);
      if (currentSequence === sequence.current) setCounts(prev => ({ ...prev, ...next }));
    } catch (error) {
      // Keep the last known counts when a temporary network failure occurs.
      if (__DEV__) console.warn('[useUnreadCounts] refresh failed:', error);
    }
  }, [accessToken]);

  useFocusEffect(useCallback(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      sequence.current += 1;
      subscription.remove();
    };
  }, [refresh]));

  return { counts, refresh };
}
