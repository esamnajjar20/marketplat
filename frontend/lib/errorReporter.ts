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

const reporterUrl = process.env.NEXT_PUBLIC_ERROR_REPORTER_URL;

export function reportClientError(error: Error, context?: Record<string, unknown>): void {
  // Always log locally first — this is the original fallback behavior,
  // preserved regardless of whether a reporter URL is configured.
  console.error('[reportClientError]', error, context);

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
export function isChunkLoadError(error: Error | null | undefined): boolean {
  const message = error?.message ?? '';
  return (
    error?.name === 'ChunkLoadError' ||
    message.includes('Loading chunk') ||
    message.includes('Loading CSS chunk') ||
    message.includes('Failed to fetch dynamically imported module')
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
  const RELOAD_WINDOW_MS = 30_000;

  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    const now = Date.now();
    if (last && now - last < RELOAD_WINDOW_MS) {
      // Already reloaded recently and still failing — do not loop. Let
      // the normal error UI render so the user can retry manually.
      console.warn('[chunk-recovery] skipped: reload within last 30s, letting error UI show');
      return false;
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
