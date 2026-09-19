'use client';

/**
 * Touches presence while the user is authenticated, the tab is visible,
 * and the device is online. Pauses on hidden tabs / offline (weak-net N1).
 */
import { useEffect } from 'react';
import { usersApi } from '@/api/users.api';
import { PRESENCE_HEARTBEAT_INTERVAL } from '@/lib/constants';
import { canBackgroundPoll } from '@/lib/polling';
import { getCsrfToken } from '@/lib/csrf';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';

export function PresenceHeartbeat() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const beat = () => {
      if (!canBackgroundPoll()) return;
      // FIX PRESENCE-CSRF-403: PATCH is state-changing, so the backend's
      // csrfProtection rejects it (403 "Invalid or missing CSRF token")
      // whenever the browser still holds the backend's csrfToken cookie
      // but the in-memory token is empty. That is exactly the state
      // after an offline → online transition (offline visual session:
      // isAuthenticated=true with no accessToken/csrfToken) or any
      // moment before AuthHydrationProvider's /auth/refresh finishes.
      // Skip this beat instead of sending a request doomed to 403; the
      // next interval tick (or 'online'/'visibilitychange') retries once
      // the refresh response has populated the token.
      if (!getCsrfToken()) return;
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
