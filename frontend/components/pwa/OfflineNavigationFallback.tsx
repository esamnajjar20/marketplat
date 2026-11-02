'use client';

import { useEffect } from 'react';
import { installOfflineNavigationFallback } from '@/lib/offlineNavigationFallback';

/**
 * When offline, use full document navigation as a fallback for App Router
 * Flight requests. The Service Worker then serves a verified visited HTML
 * shell instead of attempting to reuse a router-state-specific RSC response.
 */
export function OfflineNavigationFallback() {
  useEffect(() => installOfflineNavigationFallback(), []);
  return null;
}
