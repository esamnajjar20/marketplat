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
