'use client';

import { useSyncExternalStore } from 'react';
import { getOnlineSnapshot, getServerOnlineSnapshot, subscribeOnlineStatus } from '@/lib/networkLifecycle';

/** Shared connectivity snapshot; browser listeners are installed only while consumers exist. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnlineStatus, getOnlineSnapshot, getServerOnlineSnapshot);
}
