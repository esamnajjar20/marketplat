'use client';

/**
 * FIX AUTH-SLOW-RESTORE-01
 *
 * AuthHydrationProvider keeps the persisted `user` (and leaves
 * isAuthenticated=false) when /auth/refresh fails WITHOUT a definitive
 * rejection while the device is online — a timeout / cold backend / 5xx /
 * flaky link. A real rejection (401/403) calls logout(), which clears `user`.
 *
 * So `user != null && !isAuthenticated && online` means "session not verified
 * yet", NOT "logged out". Layouts must not redirect to /login in that state;
 * they show a retry surface instead. This hook retries the refresh in the
 * background (a few spaced attempts) and exposes a manual retry.
 * refreshSessionShared() flips isAuthenticated=true on success.
 *
 * FIX AUTH-RESTORE-ERRSHAPE-01: the "definitive rejection" test now reads
 * ParsedError.statusCode (see lib/authRestoreError.ts). The previous
 * `err.response` check never matched an apiClient rejection, so an expired
 * session left the user parked on the "server is slow" screen forever.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { refreshSessionShared } from '@/api/client';
import { useAuthStore } from '@/store/auth.store';
import { isDefiniteSessionRejection } from '@/lib/authRestoreError';

const AUTO_RETRY_DELAYS_MS = [3_000, 8_000, 15_000, 30_000];

export function useAuthRestoreRetry(active: boolean) {
  const [retrying, setRetrying] = useState(false);
  const inFlight = useRef(false);

  const retry = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRetrying(true);
    try {
      await refreshSessionShared();
    } catch (err) {
      // A genuine rejection means the session is really gone: clear it so the
      // layout's normal redirect-to-login logic takes over.
      if (isDefiniteSessionRejection(err)) useAuthStore.getState().logout();
    } finally {
      inFlight.current = false;
      setRetrying(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (const delay of AUTO_RETRY_DELAYS_MS) {
      elapsed += delay;
      timers.push(setTimeout(() => {
        if (!cancelled && !useAuthStore.getState().isAuthenticated) void retry();
      }, elapsed));
    }
    return () => { cancelled = true; timers.forEach(clearTimeout); };
  }, [active, retry]);

  return { retry, retrying };
}
