import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@/features/auth/AuthContext';
import { startOutboxSyncLifecycle, type OutboxLifecycleSnapshot } from './outbox-sync-lifecycle';

/**
 * Application-level adapter: connects the existing auth session and NetInfo
 * connectivity observer to the durable outbox lifecycle. It is mounted once
 * beneath AuthProvider, not inside individual screens.
 */
export function OutboxSyncLifecycleBridge() {
  const { accessToken, csrfToken, isRestoring } = useAuth();
  const latest = useRef<OutboxLifecycleSnapshot>({ isOnline: false, token: null, csrfToken: null });

  // Keep lifecycle callbacks fresh without re-subscribing on every connectivity event.
  useEffect(() => {
    latest.current = { ...latest.current, token: accessToken, csrfToken };
  }, [accessToken, csrfToken]);

  useEffect(() => {
    if (isRestoring) return;
    return startOutboxSyncLifecycle({
      getSnapshot: () => ({ ...latest.current }),
      subscribeConnectivity: (listener) => NetInfo.addEventListener((state) => {
        latest.current = {
          ...latest.current,
          isOnline: state.isConnected === true && state.isInternetReachable !== false,
        };
        listener();
      }),
      // The durable queue remains the source of truth. UI screens can surface
      // status later without coupling sync correctness to a mounted screen.
    });
  }, [isRestoring, accessToken, csrfToken]);

  return null;
}
