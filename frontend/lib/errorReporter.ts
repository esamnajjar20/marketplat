/**
 * FIX AUDIT-V3-06: previously ErrorBoundary.tsx's componentDidCatch and
 * app/error.tsx (the Next.js App Router error boundary) both only
 * called console.error with a `// TODO: send to error monitoring
 * service` comment — any render error happening to a real user in
 * production was invisible to the team unless that user reported it
 * themselves.
 *
 * Mirrors the backend's logger.ts ERROR_REPORTER_WEBHOOK_URL pattern:
 * a single, vendor-agnostic extension point rather than a hard
 * dependency on a specific APM SDK (Sentry, etc.) that can't be safely
 * added and verified here without a real environment to test against.
 *
 * Set NEXT_PUBLIC_ERROR_REPORTER_URL to any HTTPS endpoint and every
 * reportClientError() call also POSTs a JSON payload there, in addition
 * to always logging to the console. Must be NEXT_PUBLIC_-prefixed since
 * this runs in the browser, unlike the backend's server-only env var.
 *
 * If unset (the default), this only logs to console — same fallback
 * behavior as before this fix, just centralized in one place instead
 * of duplicated across two call sites.
 *
 * To use a real APM SDK instead (recommended for production — e.g.
 * @sentry/nextjs), replace this function's body with that SDK's
 * captureException call; call sites don't need to change either way.
 */

import { resolveErrorReporterUrl } from './errorReporterUrl';
import { isDeviceOffline } from '@/lib/offlineError';

export function reportClientError(error: Error, context?: Record<string, unknown>): void {
  // Always log locally first — this is the original fallback behavior,
  // preserved regardless of whether a reporter URL is configured.
  console.error('[reportClientError]', error, context);

  // Resolved per call (not at module load) so tests that set the env var after
  // import keep working, and a legacy onrender.com value is mapped to the live API.
  const reporterUrl = resolveErrorReporterUrl();
  if (!reporterUrl) return;

  const payload = JSON.stringify({
    message: error.message,
    stack: error.stack,
    name: error.name,
    context,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    timestamp: new Date().toISOString(),
    service: 'marketplace-frontend',
  });

  // Fire-and-forget — never let error reporting itself throw or affect
  // the error boundary's own render/recovery path. fetch with keepalive
  // so the request isn't cancelled if the error caused a navigation.
  fetch(reporterUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Intentionally swallowed — if the error reporter itself is down,
    // that's not something the app's own error path should fail on.
  });
}


/**
 * FIX CHUNK-LOAD-RECOVERY-01: Next.js emits a "ChunkLoadError" (or a
 * message like "Loading chunk N failed") when the browser requests a
 * JS chunk that no longer exists on the server — which happens on every
 * deploy, because Next.js hashes chunk filenames and the old hashes
 * vanish as soon as the new build replaces them. A user with a stale
 * HTML document (typically cached by our own Service Worker) tries to
 * load a page, the referenced chunk has rotated, and the route's error
 * boundary renders "حدث خطأ أثناء تحميل هذه الصفحة" instead of the page.
 *
 * Recovery policy: a single hard reload may repair a stale chunk on
 * ordinary routes. Repeated failures are left to the route/section error
 * UI; automatic cache purges are deliberately avoided because transient
 * network failures do not prove that the Service Worker caches are corrupt.
 *
 * Called from every error.tsx before it renders the fallback UI. If it
 * returns true, a reload was triggered and the caller should render
 * null (or a spinner); the reload will surface the fresh page.
 */
/**
 * CHUNK-OFFLINE-NOREPORT-01: true when the error is a ChunkLoadError
 * AND the device is provably offline. This is the one case where the
 * error boundary should NOT report: no recovery is possible (a reload
 * would just re-serve the same offline shell), and on a mobile network
 * this fires for every user, every time they open a cached page while
 * the link is briefly down. Report noise, not signal.
 *
 * Online ChunkLoadError still reaches the recovery/error UI. It may be
 * a stale deployment or a transient request failure; handleChunkLoadError
 * applies the route-specific recovery policy above.
 */
export function isOfflineChunkLoadError(
  error: Error | null | undefined,
): boolean {
  if (!isChunkLoadError(error)) return false;
  if (typeof navigator === 'undefined') return false;
  return isDeviceOffline();
}

export function isChunkLoadError(error: Error | null | undefined): boolean {
  const message = error?.message ?? '';
  // Webpack/Next runtime can surface a missing or mismatched chunk as a
  // module-table TypeError instead of the more obvious ChunkLoadError.
  // The device log included Chrome's exact message below on /products; treat
  // this narrowly as stale-runtime recovery, while leaving unrelated TypeErrors
  // to the normal error boundary.
  const missingWebpackModuleCall =
    /cannot read properties of undefined \(reading ['"]call['"]\)/i.test(message) ||
    /cannot read property ['"]call['"] of undefined/i.test(message);

  return (
    error?.name === 'ChunkLoadError' ||
    message.includes('Loading chunk') ||
    message.includes('Loading CSS chunk') ||
    message.includes('Failed to fetch dynamically imported module') ||
    missingWebpackModuleCall
  );
}

export function handleChunkLoadError(error: Error): boolean {
  if (typeof window === 'undefined') return false;

  if (!isChunkLoadError(error)) return false;

  // FIX CHUNK-OFFLINE-01: a reload cannot fix a chunk that failed because
  // the device is offline (the chunk was simply never cached) — it only
  // re-serves the same cached shell, fails again, and burns the one-shot
  // 30s recovery window. Return false so the error UI renders (and can
  // explain the offline cause) instead of reloading pointlessly.
  if (isDeviceOffline()) {
    console.warn('[chunk-recovery] skipped: device is offline');
    return false;
  }

  // Homepage rails are intentionally loaded as separate chunks only when
  // the visitor scrolls near them. A transient network failure for one of
  // those chunks must not reload the entire document (which sends the user
  // back to the top and repeats the same sequence on the next scroll).
  // HomeSectionBoundary catches the section error and offers an explicit
  // user-initiated reload instead.
  if (window.location.pathname === '/') {
    console.warn('[chunk-recovery] deferred on homepage; keeping the current scroll session');
    return false;
  }

  const KEY = 'chunk-load-reload-at';
  const RELOAD_WINDOW_MS = 30_000;

  const now = Date.now();
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);

    if (last && now - last < RELOAD_WINDOW_MS) {
      // One recovery reload was already attempted. Do not unregister the
      // Service Worker or erase every Cache Storage bucket automatically:
      // a transient chunk/network failure is not proof that all offline
      // caches are corrupt. Let the route/section error UI offer recovery.
      console.warn('[chunk-recovery] skipped: one reload already attempted; preserving caches');
      return false;
    }

    sessionStorage.setItem(KEY, String(now));
  } catch {
    // Without a persistent loop guard, do not risk reloading on every visit.
    console.warn('[chunk-recovery] skipped: session storage unavailable; preserving the current page');
    return false;
  }

  console.warn('[chunk-recovery] stale chunk detected — forcing reload to fetch new build');
  window.location.reload();
  return true;
}

// ── Global unhandled rejection filter ─────────────────────────────
// Without this, two classes of self-healing failure flood Sentry as
// "Unhandled promise rejection":
//
//  1) A stale chunk after a deploy (import() rejects before any of
//     our code can catch it) — recoverFromStaleChunk already knows
//     how to fix this, but the browser fires unhandledrejection
//     before that helper's own catch runs.
//  2) Transient network errors during SSE reconnect, or an aborted
//     fetch when the user navigates away. The caller retries; there
//     is nothing actionable to report.
//
// Both are filtered here so real bugs still reach the default
// listener (our window 'error' handler that forwards to Sentry).
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason as { name?: string; message?: string } | string | undefined;
    const msg = typeof reason === 'string' ? reason : reason?.message ?? '';
    const name = typeof reason === 'object' && reason ? reason.name ?? '' : '';

    // 1) Stale chunk after deploy — recover by hard reload once (the
    //    existing recoverFromStaleChunk helper handles the dedupe).
    if (
      name === 'ChunkLoadError' ||
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk')
    ) {
      event.preventDefault();
      handleChunkLoadError(reason as Error);
      return;
    }

    // 2) Transient network noise — SSE reconnect, aborted navigation.
    if (
      name === 'AbortError' ||
      name === 'NetworkError' ||
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError when attempting to fetch')
    ) {
      event.preventDefault();
    }
  });
}

