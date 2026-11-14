'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { isDeviceOffline } from '@/lib/offlineError';

/**
 * Records a completed page visit with the Service Worker.
 * This is deliberately route-commit based, not RSC-request based: Next.js may
 * reuse a prefetched Flight response and issue no request when the user clicks.
 * Only the Service Worker decides whether the route belongs in shared or
 * user-scoped storage; private/admin routes remain excluded there.
 */
export function VisitedPageShellTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  useEffect(() => {
    if (!pathname || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const url = window.location.href;
    let cancelled = false;
    void navigator.serviceWorker.ready.then((registration) => {
      if (cancelled || isDeviceOffline()) return;
      const worker = navigator.serviceWorker.controller ?? registration.active;
      worker?.postMessage({ type: 'CACHE_VISITED_PAGE', url });
    }).catch(() => {
      // Page rendering must never depend on offline shell bookkeeping.
    });
    return () => { cancelled = true; };
  }, [pathname, search]);

  return null;
}
