import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '@/features/auth/AuthContext';
import { invalidateFavoritesSyncSession, syncFavoritesIfReady, type FavoritesSyncSnapshot } from './favorites-sync-lifecycle';

/** App-level lifecycle hook: retry favorite outbox on connectivity restoration and foregrounding. */
export function FavoritesSyncLifecycleBridge() {
  const { accessToken, csrfToken, user, isRestoring } = useAuth();
  const snapshot = useRef<FavoritesSyncSnapshot>({ isOnline: false, isActive: true, userId: null, token: null, csrfToken: null });

  useEffect(() => {
    // A token/user change invalidates any async work captured by the previous auth session.
    invalidateFavoritesSyncSession();
    snapshot.current = { ...snapshot.current, userId: user?.id ?? null, token: accessToken, csrfToken };
  }, [accessToken, csrfToken, user?.id]);

  useEffect(() => {
    if (isRestoring) return;
    let mounted = true;
    const run = () => {
      if (!mounted) return;
      // A session change can invalidate an in-flight sync. Once that promise settles, retry
      // with the latest snapshot so the new session does not wait for another network/app event.
      void syncFavoritesIfReady({ ...snapshot.current }).then((result) => {
        if (mounted && result.status === 'deferred' && (result.retryAfterActiveSync || result.reason.startsWith('تغيّرت جلسة تسجيل الدخول'))) {
          setTimeout(() => { if (mounted) void syncFavoritesIfReady({ ...snapshot.current }); }, 0);
        }
      }).catch(() => undefined);
    };
    const unsubscribeNet = NetInfo.addEventListener((state) => {
      snapshot.current = { ...snapshot.current, isOnline: state.isConnected === true && state.isInternetReachable !== false };
      run();
    });
    const onAppState = (state: AppStateStatus) => {
      snapshot.current = { ...snapshot.current, isActive: state === 'active' };
      run();
    };
    const appSub = AppState.addEventListener('change', onAppState);
    run();
    return () => { mounted = false; unsubscribeNet(); appSub.remove(); };
  }, [isRestoring, accessToken, csrfToken, user?.id]);

  return null;
}
