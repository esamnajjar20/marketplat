'use client';

import { useEffect, useState } from 'react';
import {
  SUSPECT_WINDOW_MS,
  isConnectivitySuspect,
  subscribeConnectionQuality,
} from '@/lib/connectionQuality';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * CONNECTIVITY-SUSPECT-01: true while the browser says "online" but recent
 * real requests keep failing (see isConnectivitySuspect). Re-evaluated on
 * every request outcome, on online/offline changes, and once the failure
 * streak ages out, so a stale warning cannot stay on screen when the user
 * simply stops making requests.
 */
export function useConnectivitySuspect(): boolean {
  const isOnline = useOnlineStatus();
  const [suspect, setSuspect] = useState(false);

  useEffect(() => {
    const refresh = () => setSuspect(isConnectivitySuspect());
    refresh();
    return subscribeConnectionQuality(refresh);
  }, [isOnline]);

  useEffect(() => {
    if (!suspect) return;
    const id = window.setTimeout(() => setSuspect(isConnectivitySuspect()), SUSPECT_WINDOW_MS + 1000);
    return () => window.clearTimeout(id);
  }, [suspect]);

  return isOnline && suspect;
}
