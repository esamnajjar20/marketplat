'use client';

import dynamic from 'next/dynamic';
import { useAuthStore } from '@/store/auth.store';

// Presence is only meaningful with a live access token. Keep the heartbeat's
// API/polling dependencies out of the shared public chunk and request its
// chunk only after auth hydration has restored an authenticated session.
const PresenceHeartbeat = dynamic(
  () => import('./PresenceHeartbeat').then((module) => module.PresenceHeartbeat),
  { ssr: false, loading: () => null },
);

export function AuthenticatedPresence() {
  const shouldRun = useAuthStore((state) =>
    state.isHydrated &&
    !state.isAuthResolving &&
    state.isAuthenticated &&
    Boolean(state.accessToken),
  );
  return shouldRun ? <PresenceHeartbeat /> : null;
}
