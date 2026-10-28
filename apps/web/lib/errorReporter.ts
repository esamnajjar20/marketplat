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
 * Fix: detect that specific failure, force ONE hard reload to fetch the
 * new chunks, and — if the same failure recurs within a short window —
 * stop looping and let the normal error UI show instead. The short
 * window prevents a genuinely broken deployment (where the chunks
 * never resolve) from reloading forever.
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
 * Online ChunkLoadError still reaches the reporter — that one is
 * actionable (stale deploy). See handleChunkLoadError above.
 */
export function isOfflineChunkLoadError(
  error: Error | null | undefined,
): boolean {
  if (!isChunkLoadError(error)) return false;
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
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
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    console.warn('[chunk-recovery] skipped: device is offline');
    return false;
  }

  const KEY = 'chunk-load-reload-at';
  const PURGE_AT_KEY = 'chunk-load-purged-at';
  const RELOAD_WINDOW_MS = 30_000;

  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    const lastPurgeAt = Number(sessionStorage.getItem(PURGE_AT_KEY) ?? 0);
    const now = Date.now();

    if (last && now - last < RELOAD_WINDOW_MS) {
      // A plain reload already ran within the last 30s and the same
      // chunk is still missing — classic symptom of a stale HTML
      // document served from the Service Worker cache that points at
      // rotated chunk hashes. A second plain reload would just loop.
      if (lastPurgeAt && now - lastPurgeAt < RELOAD_WINDOW_MS) {
        // We already tried the hard purge and it still failed — this
        // is a genuine server-side issue (bad build, missing chunk).
        // Let the error UI show so the user can report it.
        console.warn('[chunk-recovery] skipped: purge already attempted, letting error UI show');
        return false;
      }

      // HARD PURGE: unregister every Service Worker and wipe every
      // Cache Storage bucket, then reload. This guarantees the next
      // navigation hits the network for HTML, so the manifest and the
      // chunk hashes finally match.
      console.warn('[chunk-recovery] reload did not fix — purging SW + caches');
      try { sessionStorage.setItem(PURGE_AT_KEY, String(now)); } catch {}
      void purgeCachesThenReload();
      return true;
    }

    sessionStorage.setItem(KEY, String(now));
  } catch {
    // sessionStorage unavailable — still reload once, since the lack of
    // a persistent marker only risks a loop in a narrow edge case.
  }

  console.warn('[chunk-recovery] stale chunk detected — forcing reload to fetch new build');
  window.location.reload();
  return true;
}

/**
 * Last-resort stale-build recovery. Remove only cached document/RSC shells,
 * keeping offline data, queued mutations, images, and static core assets intact.
 * A full Cache Storage wipe here used to erase user data and offline capability
 * whenever a chunk error repeated, which is disproportionate to a stale shell.
 */
async function purgeCachesThenReload(): Promise<void> {
  // Do the selective purge from the page as well as notifying the controller:
  // a still-active older SW may not understand PURGE_STALE_SHELLS yet.
  try {
    if (typeof caches !== 'undefined') {
      const names = (await caches.keys()).filter((name) =>
        /^market-(?:static|personal-shell)-v\d+$/.test(name),
      );
      for (const name of names) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const response = await cache.match(request);
          if (!response) continue;
          const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
          const source = response.headers.get('X-SW-Cache-Source') ?? '';
          let isRsc = false;
          let isOfflineFallback = false;
          try {
            const url = new URL(request.url);
            isRsc = url.searchParams.has('_rsc') || /\.rsc$/i.test(url.pathname);
            isOfflineFallback = url.pathname === '/offline';
          } catch { /* ignore malformed cache key */ }
          if (!isOfflineFallback && (contentType.includes('text/html') || source === 'rsc' || isRsc)) {
            await cache.delete(request);
          }
        }
      }
    }
  } catch { /* selective cache cleanup is best-effort */ }

  const controller = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    ? navigator.serviceWorker.controller
    : null;

  if (controller) {
    try {
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          channel.port1.close();
          resolve();
        };
        channel.port1.onmessage = finish;
        window.setTimeout(finish, 1800);
        controller.postMessage({ type: 'PURGE_STALE_SHELLS' }, [channel.port2]);
      });
    } catch { /* reload still provides a best-effort recovery */ }
  }
  window.location.reload();
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

