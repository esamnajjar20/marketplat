import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '@/features/auth/AuthContext';
import { useIsOnline } from '@/lib/connectivity';
import { getActiveSyncPromise, invalidateFavoritesSyncSession, syncFavoritesIfReady, type FavoritesSyncSnapshot } from './favorites-sync-lifecycle';

/** Retry favorites outbox on connectivity restoration and foregrounding.
 *  Connectivity is provided by ConnectivityProvider (single NetInfo listener for the app). */
export function FavoritesSyncLifecycleBridge() {
  const { accessToken, csrfToken, user, isRestoring } = useAuth();
  const isOnline = useIsOnline();
  const snapshot = useRef<FavoritesSyncSnapshot>({ isOnline: false, isActive: true, userId: null, token: null, csrfToken: null });

  useEffect(() => {
    invalidateFavoritesSyncSession();
    snapshot.current = { ...snapshot.current, userId: user?.id ?? null, token: accessToken, csrfToken, isOnline };
  }, [accessToken, csrfToken, user?.id, isOnline]);

  useEffect(() => {
    if (isRestoring || !isOnline) return;
    let mounted = true;
    const run = () => {
      if (!mounted) return;
      void syncFavoritesIfReady({ ...snapshot.current })
        .then((result) => {
          if (!mounted || result.status !== 'deferred') return;
          // A different account's sync is still in-flight: wait for it
          // to finish, then retry with the current snapshot.
          // The previous setTimeout(0) retried immediately and always hit
          // 'deferred' again because activeSync was still alive.
          if ('retryAfterActiveSync' in result && result.retryAfterActiveSync) {
            const ongoing = getActiveSyncPromise();
            if (!ongoing) return;
            void ongoing.finally(() => {
              if (mounted) void syncFavoritesIfReady({ ...snapshot.current }).catch(() => undefined);
            });
          }
        })
        .catch(() => undefined);
    };
    const onAppState = (state: AppStateStatus) => {
      snapshot.current = { ...snapshot.current, isActive: state === 'active' };
      run();
    };
    const appSub = AppState.addEventListener('change', onAppState);
    run();
    return () => { mounted = false; appSub.remove(); };
  }, [isRestoring, isOnline, accessToken, csrfToken, user?.id]);

  return null;
}
