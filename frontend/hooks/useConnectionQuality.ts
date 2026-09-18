'use client';

import { useEffect, useState } from 'react';
import {
  getConnectionQuality,
  subscribeConnectionQuality,
  type ConnectionQuality,
} from '@/lib/connectionQuality';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * PHASE-1: fast | slow | offline | unknown — driven by last request timings
 * and navigator.connection when samples are empty.
 */
export function useConnectionQuality(): ConnectionQuality {
  const isOnline = useOnlineStatus();
  const [quality, setQuality] = useState<ConnectionQuality>(() =>
    typeof window === 'undefined' ? 'unknown' : getConnectionQuality(),
  );

  useEffect(() => {
    const refresh = () => setQuality(getConnectionQuality());
    refresh();
    return subscribeConnectionQuality(refresh);
  }, []);

  useEffect(() => {
    setQuality(getConnectionQuality());
  }, [isOnline]);

  // Listen to Network Information API changes when available
  useEffect(() => {
    const conn = (navigator as Navigator & {
      connection?: EventTarget & { effectiveType?: string };
    }).connection;
    if (!conn || typeof conn.addEventListener !== 'function') return;
    const onChange = () => setQuality(getConnectionQuality());
    conn.addEventListener('change', onChange);
    return () => conn.removeEventListener('change', onChange);
  }, []);

  if (!isOnline) return 'offline';
  return quality;
}
