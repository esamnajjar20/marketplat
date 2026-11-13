import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { setHardOffline } from '@/lib/connectivity-state';

/**
 * Single source of truth for online/offline across the app.
 * Bridges (chat, outbox, favorites) consume `useIsOnline()` instead of
 * registering their own NetInfo listeners — one listener instead of three.
 *
 * Semantics: online = isConnected === true && isInternetReachable !== false.
 * `null` (unknown) is treated as online (conservative).
 */
type ConnectivityValue = { isOnline: boolean };
const ConnectivityContext = createContext<ConnectivityValue>({ isOnline: true });

function normalize(state: { isConnected: boolean | null; isInternetReachable: boolean | null }): boolean {
  if (state.isConnected === false || state.isInternetReachable === false) return false;
  // Unknown during startup is not proof of disconnection; avoid a false offline banner.
  return true;
}

function track(state: { isConnected: boolean | null }): void {
  setHardOffline(state.isConnected === false);
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    let mounted = true;
    void NetInfo.fetch().then((state) => {
      track(state);
      if (mounted) setIsOnline(normalize(state));
    }).catch(() => undefined);

    const unsubscribe = NetInfo.addEventListener((state) => {
      track(state);
      if (mounted) setIsOnline(normalize(state));
    });

    return () => { mounted = false; unsubscribe(); };
  }, []);

  const value = useMemo(() => ({ isOnline }), [isOnline]);

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useIsOnline(): boolean {
  return useContext(ConnectivityContext).isOnline;
}
