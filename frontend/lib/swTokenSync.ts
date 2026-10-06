/**
 * T700 — syncs the csrfToken the Service Worker obtained from its own
 * /auth/refresh call into the page's auth store.
 *
 * Why this exists: the backend rotates csrfToken on every successful
 * /auth/refresh (backend's setCsrfCookie uses crypto.randomBytes(32)
 * per call — see authCookies.ts). When the SW's offline-queue replay
 * hits a 401 and refreshes on the page's behalf, the response carries
 * a brand-new csrfToken, the browser stores the new value in the
 * csrfToken cookie automatically, but the page's in-memory copy in
 * useAuthStore is left holding the OLD value.
 *
 * The next state-changing request from the page then sends
 * X-CSRF-Token: <old> while the browser attaches
 * cookie csrfToken=<new>, the backend's double-submit check in
 * csrf.middleware.ts compares them and rejects with 403. lib/api/
 * client.ts's self-heals by triggering its
 * own refresh + retry, so this is not a correctness hole — but it
 * costs an extra 403, an extra round-trip, and 403-Sentry noise on
 * exactly the weak-network scenarios the offline queue exists for.
 *
 * The SW now posts { type: 'SW_TOKEN_REFRESHED', csrfToken } to every
 * window client after a successful refresh (see public/sw.js's
 * refreshAccessToken). This module listens for that message and writes
 * the value straight into the store via setCsrfToken, so the very
 * next request the page makes sends the correct header.
 *
 * Scope is deliberately narrow: ONLY csrfToken. The accessToken the
 * SW refreshed is also fresh, but the page will get its own fresh
 * accessToken on its own next 401 (client.ts's interceptor handles
 * that path already), and posting it here would create a second,
 * independent writer to the same store field — exactly the class of
 * race the existing refreshQueue machinery exists to prevent. The
 * csrfToken is the one field where the SW's refresh is invisible to
 * the page by design.
 *
 * Installed from OfflineBootstrap alongside initAdDraftSync. Kept in
 * its own file (not folded into offlineAdDraftSync, which handles a
 * different concern — linking queued drafts to their operationIds)
 * so that a future change to either concern doesn't have to walk
 * through the other.
 */
import { useAuthStore } from '@/store/auth.store';
import { refreshSessionShared } from '@/api/client';
import { requestQueueReplay } from '@/lib/offlineQueue';

interface SwTokenMessage {
  type: 'SW_TOKEN_REFRESHED';
  csrfToken: string;
}

function isSwTokenMessage(data: unknown): data is SwTokenMessage {
  if (!data || typeof data !== 'object') return false;
  const d = data as { type?: unknown; csrfToken?: unknown };
  return (
    d.type === 'SW_TOKEN_REFRESHED' &&
    typeof d.csrfToken === 'string' &&
    d.csrfToken.length > 0
  );
}

let installed = false;

/** Idempotent — calling more than once per page load is a no-op. */
export function initSwTokenSync(): void {
  if (installed) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  installed = true;

  navigator.serviceWorker.addEventListener('message', (event) => {
    // PAGE-PRIORITY-01: SW defers its refresh to us when a window is
    // visible (see public/sw.js's refreshAccessToken). Fire the refresh
    // here so the fresh Set-Cookie lands in the shared cookie jar before
    // the SW's next queue-drain attempt. Our own apiClient response
    // interceptor already has a "no recursion on /auth/refresh" guard,
    // so a failing refresh here just rejects once — no loop.
    const raw = event.data as { type?: unknown } | null | undefined;
    if (raw && typeof raw === 'object' && raw.type === 'SW_REQUEST_REFRESH') {
      void refreshSessionShared()
        .then(() => requestQueueReplay())
        .catch(() => {
          /* SW will fall back to its own refresh on the next drain */
        });
      return;
    }
    if (!isSwTokenMessage(event.data)) return;
    try {
      useAuthStore.getState().setCsrfToken(event.data.csrfToken);
    } catch (err) {
      // setCsrfToken is a pure Zustand setter and shouldn't throw, but
      // this listener runs outside React's error boundaries — a throw
      // here would surface as an unhandled error in the SW message
      // channel with no clear origin.
      console.warn('[sw-token-sync] setCsrfToken failed:', err);
    }
  });
}
