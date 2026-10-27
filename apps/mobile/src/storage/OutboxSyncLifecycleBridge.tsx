import { useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth/AuthContext';
import { useIsOnline } from '@/lib/connectivity';
import { startOutboxSyncLifecycle, type OutboxLifecycleSnapshot } from './outbox-sync-lifecycle';

/**
 * Adapter: connects the auth session and connectivity to the durable outbox
 * lifecycle. Mounted once beneath AuthProvider. Connectivity comes from
 * ConnectivityProvider (single NetInfo listener), not from this bridge.
 */
export function OutboxSyncLifecycleBridge() {
  const { accessToken, csrfToken, user, isRestoring } = useAuth();
  const isOnline = useIsOnline();
  const latest = useRef<OutboxLifecycleSnapshot>({ isOnline: false, token: null, ownerId: null, csrfToken: null });

  useEffect(() => {
    latest.current = { ...latest.current, token: accessToken, ownerId: user?.id ?? null, csrfToken, isOnline };
  }, [accessToken, csrfToken, user?.id, isOnline]);

  useEffect(() => {
    if (isRestoring || !isOnline) return;
    return startOutboxSyncLifecycle({
      getSnapshot: () => ({ ...latest.current }),
      subscribeConnectivity: () => () => undefined,
    });
  }, [isRestoring, isOnline, accessToken, csrfToken, user?.id]);

  return null;
}
