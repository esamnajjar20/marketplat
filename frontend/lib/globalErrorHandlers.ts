/**
 * FIX GLOBAL-ERROR-LISTENERS-01: catches the error classes that React
 * error boundaries CANNOT — anything thrown from an event handler, a
 * timer, an async function, or a promise rejection. React's
 * error.tsx / ErrorBoundary mechanism only fires for errors during
 * render, in a lifecycle method, or in a constructor. That leaves a
 * large, real class of production failures invisible in this app:
 *
 *   - onClick/onChange handlers that throw
 *   - setTimeout/setInterval callbacks
 *   - fetch().then() chains with no .catch()
 *   - async functions called from useEffect (unhandled promise)
 *   - errors in non-React modules (offlineQueue, pwa.ts, etc.)
 *
 * Before this, all of those landed only in the browser console — which
 * nobody sees in production. On a Gaza mobile network, the failure
 * modes above (timeout errors, network blips surfacing as rejections)
 * are the dominant ones; having zero visibility into them meant real
 * regressions could go undetected for weeks.
 *
 * Wires window.onerror and window.onunhandledrejection to the existing
 * reportClientError() pipeline so they flow to the same reporter URL
 * the React boundaries already use — no new dependency, no new
 * transport, no new place for the two paths to drift.
 *
 * Deduplicates by (message + source) within a 5s window: a broken
 * component that throws on every keystroke would otherwise flood the
 * reporter. One sample per unique signature per window is enough to
 * know the bug exists.
 */

import { reportClientError, isChunkLoadError, handleChunkLoadError } from './errorReporter';

const DEDUPE_WINDOW_MS = 5_000;
const recent = new Map<string, number>();

function shouldReport(signature: string): boolean {
  const now = Date.now();
  const last = recent.get(signature);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false;
  recent.set(signature, now);
  // Bound the map so a pathological error loop can't grow it forever.
  if (recent.size > 200) {
    const oldest = recent.keys().next().value;
    if (oldest !== undefined) recent.delete(oldest);
  }

  return true;
}

/**
 * FIX GLOBAL-ERROR-ABORT-FILTER-01: fetch() aborts -- from navigation
 * away from a page, a cancelled TanStack Query, a component unmount
 * mid-flight, or the browser's own lifecycle -- surface as DOMException
 * AbortError rejections. They are not bugs; they are the intended
 * outcome of aborting. Before this filter every navigation that
 * cancelled an in-flight request produced a Sentry event, and on a
 * mobile SPA with routes as chatty as this one that is dozens per
 * session per user.
 *
 * Detection covers both the modern shape (DOMException.name ===
 * 'AbortError') and the message variants some browsers/transports
 * still emit ('The user aborted a request', 'The operation was
 * aborted', 'signal is aborted without reason').
 */
function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  if (name === 'AbortError') return true;
  const message = (err as { message?: unknown }).message;
  if (typeof message !== 'string') return false;
  return message.includes('aborted') || message.includes('user aborted');
}

let installed = false;

/**
 * Idempotent. Called once from AppProviders; a second call is a no-op
 * so React StrictMode's double-mount in dev can't double-register.
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;
  if (installed) return;
  installed = true;

  // FIX GLOBAL-ERROR-LISTENERS-01: window 'error' event — fires for
  // every uncaught synchronous error in the page, regardless of where
  // it originated. This is the broadest net. It also fires for
  // resource-loading failures (img, script) — filtered out here by
  // checking event.error, which is only present for real JS errors.
  window.addEventListener('error', (event) => {
    const error = event.error;
    if (!error) return; // resource load failure, not a JS error — skip
    // FIX GLOBAL-ERROR-ABORT-FILTER-01: same filter as the rejection
    // handler below -- rare here (AbortErrors almost always surface
    // as promise rejections), but cheap insurance against the same
    // false-positive class if a caller ever throws one synchronously.
    if (isAbortError(error)) return;

    // GLOBAL-ERROR-FILTERS-01: ChunkLoadError is not a bug — it's a
    // normal artifact of a fresh deploy (Next.js hashed chunks from the
    // old build were replaced). Every error.tsx already calls
    // handleChunkLoadError() to trigger one reload; the global handler
    // was NOT doing this, so every deploy produced a Sentry event per
    // affected user and no recovery. Mirror the boundary behaviour here.
    if (error instanceof Error && isChunkLoadError(error)) {
      handleChunkLoadError(error);
      return;
    }

    const signature = `error:${error.name}:${error.message}:${event.filename}:${event.lineno}`;
    if (!shouldReport(signature)) return;

    reportClientError(error instanceof Error ? error : new Error(String(error)), {
      source: 'window.error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  // FIX GLOBAL-ERROR-LISTENERS-01: unhandled promise rejections — the
  // single most common shape of "silent" failure in a fetch-heavy app.
  // Everything from a dropped network call in an un-caught async path
  // to a bug in a fire-and-forget background task lands here.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;

    // GLOBAL-ERROR-FILTERS-01: skip rejections with nothing to report.
    // A promise rejected with `undefined`, `null`, or a DOM `Event`
    // (from a dispatchEvent that a listener rejected) was being
    // stringified into a generic 'Unhandled promise rejection' — pure
    // Sentry noise with no stack, no message, no fix. Nothing useful
    // to act on, so don't spend a report.
    if (reason === undefined || reason === null) return;
    if (reason instanceof Event) return;

    // FIX GLOBAL-ERROR-ABORT-FILTER-01: abort rejections are the
    // expected outcome of a cancelled request, not bugs. Filter before
    // the dedup/error-wrap path so we don't spend map slots or
    // reporter bandwidth on them (see isAbortError above).
    if (isAbortError(reason)) return;

    // GLOBAL-ERROR-FILTERS-01: chunk errors can also arrive as
    // rejections (dynamic import() failures, lazy route chunks). Same
    // recover-and-don't-report treatment as the sync path above.
    if (reason instanceof Error && isChunkLoadError(reason)) {
      handleChunkLoadError(reason);
      return;
    }

    // The rejection value isn't always an Error — apps reject with
    // plain objects, strings, or API error shapes all the time. Wrap
    // non-Errors so reportClientError gets a consistent shape, but
    // preserve the original in `context` so the raw value isn't lost.
    const error =
      reason instanceof Error
        ? reason
        : new Error(typeof reason === 'string' ? reason : 'Unhandled promise rejection');

    const signature = `rejection:${error.message}`;
    if (!shouldReport(signature)) return;

    reportClientError(error, {
      source: 'window.unhandledrejection',
      rawReason: reason instanceof Error ? undefined : String(reason),
    });
  });
}
