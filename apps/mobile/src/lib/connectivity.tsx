import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * Single source of truth for online/offline across the app.
 * Bridges (chat, outbox, favorites) consume `useIsOnline()` instead of
 * registering their own NetInfo listeners — one listener instead of three.
 *
 * Semantics: online = isConnected === true && isInternetReachable !== false.
 * `null` (unknown) is treated as online (conservative).
 */
type ConnectivityValue = { isOnline: boolean };
const ConnectivityContext = createContext<ConnectivityValue>({ isOnline: false });

function normalize(state: { isConnected: boolean | null; isInternetReachable: boolean | null }): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    let mounted = true;
    void NetInfo.fetch().then((state) => {
      if (mounted) setIsOnline(normalize(state));
    }).catch(() => undefined);

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (mounted) setIsOnline(normalize(state));
    });

    return () => { mounted = false; unsubscribe(); };
  }, []);

  return <ConnectivityContext.Provider value={{ isOnline }}>{children}</ConnectivityContext.Provider>;
}

export function useIsOnline(): boolean {
  return useContext(ConnectivityContext).isOnline;
}
