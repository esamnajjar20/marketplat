import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useAuth } from '@/features/auth/AuthContext';
import { useIsOnline } from '@/lib/connectivity';
import { invalidateFavoritesSyncSession, syncFavoritesIfReady, type FavoritesSyncSnapshot } from './favorites-sync-lifecycle';

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
      void syncFavoritesIfReady({ ...snapshot.current }).then((result) => {
        if (mounted && result.status === 'deferred' && (result.retryAfterActiveSync || result.reason.startsWith('تغيّرت جلسة تسجيل الدخول'))) {
          setTimeout(() => { if (mounted) void syncFavoritesIfReady({ ...snapshot.current }); }, 0);
        }
      }).catch(() => undefined);
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
