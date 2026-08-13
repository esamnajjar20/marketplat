'use client';

/**
 * Presence heartbeat — pings PATCH /users/me/presence every
 * PRESENCE_HEARTBEAT_INTERVAL while the caller is authenticated, so
 * usePresence()/useIsUserOnline() readers elsewhere (ChatWindow,
 * ConversationList) see this user as online. Mounted once in
 * AppProviders, same single no-props bootstrap pattern as
 * PageViewTracker.tsx and PwaBootstrap.tsx.
 *
 * Fires immediately on mount/login (not just on the first interval
 * tick) so a freshly-authenticated session doesn't sit "offline" for
 * up to a full PRESENCE_HEARTBEAT_INTERVAL before the first beat.
 * Silently drops failures — a missed heartbeat just means the caller's
 * presence key expires a little early on the backend (see presence.ts's
 * own TTL slack), never worth surfacing as a toast to the user.
 */
import { useEffect } from 'react';
import { usersApi } from '@/api/users.api';
import { PRESENCE_HEARTBEAT_INTERVAL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';

export function PresenceHeartbeat() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    const beat = () => {
      usersApi.touchPresence().catch(() => {
        // Best-effort — see file header.
      });
    };

    beat();
    const interval = setInterval(beat, PRESENCE_HEARTBEAT_INTERVAL);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  return null;
}
