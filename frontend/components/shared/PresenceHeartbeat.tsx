'use client';

/**
 * Touches presence while the user is authenticated, the tab is visible,
 * and the device is online. Pauses on hidden tabs / offline (weak-net N1).
 */
import { useEffect } from 'react';
import { usersApi } from '@/api/users.api';
import { PRESENCE_HEARTBEAT_INTERVAL } from '@/lib/constants';
import { canBackgroundPoll } from '@/lib/polling';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';

export function PresenceHeartbeat() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const beat = () => {
      if (!canBackgroundPoll()) return;
      usersApi.touchPresence().catch(() => {
        // Best-effort
      });
    };

    const start = () => {
      if (intervalId != null) return;
      beat();
      intervalId = setInterval(beat, PRESENCE_HEARTBEAT_INTERVAL);
    };

    const stop = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const sync = () => {
      if (canBackgroundPoll()) start();
      else stop();
    };

    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, [isAuthenticated]);

  return null;
}
