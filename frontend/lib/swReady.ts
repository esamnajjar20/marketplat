/**
 * navigator.serviceWorker.ready never resolves (and
 * never rejects) when no Service Worker is registered at all — a documented
 * quirk of the spec: the promise waits for an activation that will never
 * come. This is fine in production where sw.js registers unconditionally,
 * but it silently hangs forever in every case where the SW is absent:
 *
 *   - next dev without NEXT_PUBLIC_ENABLE_SW_DEV=true (see lib/pwa.ts's
 *     registerServiceWorker — the SW is deliberately skipped in dev to
 *     avoid HMR/cache conflicts).
 *   - Browsers/extensions/policies that block service workers entirely.
 *   - Private-mode contexts in some browsers.
 *   - The window between a manual unregister (DevTools) and the next
 *     successful register() call.
 *
 * Every call site (retryFailedRequest, discardFailedRequest,
 * clearOfflineQueue, requestQueueReplay, publishOne's post-DISCARD,
 * offlineMessagesQueue's own variants) awaited `navigator.serviceWorker
 * .ready` directly, so a missing SW turned every one of those operations
 * into an unresolved promise — the UI silently showed "loading" and the
 * operation (retry / discard / clear-on-logout / replay) never ran and
 * never errored.
 *
 * This helper returns as soon as we know there is no SW to talk to:
 *   1. If a registration already exists, return it immediately (the
 *      common production case — zero added latency vs `ready`).
 *   2. Otherwise, race `ready` against a short timeout. A missing SW
 *      resolves to null in `timeoutMs` instead of hanging forever.
 *
 * Callers must handle the null case — all of them already do (they use
 * `registration?.active?.postMessage(...)` or return early on null), so
 * the change is a pure safety net, not a behavior change for the happy
 * path.
 *
 * 1500ms is generous: an existing registration resolves synchronously via
 * getRegistration() above; only a genuinely-absent SW ever hits the
 * timeout branch, and 1.5s of waiting is far better than an infinite hang.
 */
export async function getActiveSW(
  timeoutMs = 1_500,
): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  // Fast path — do NOT touch `ready` if a registration already exists:
  // `ready` can still stall until an activating worker finishes, which is
  // fine in production but undesirable here when we can answer now.
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
  } catch {
    /* fall through to the raced `ready` below */
  }

  // No registration found — `ready` would hang forever. Race it.
  return new Promise<ServiceWorkerRegistration | null>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);

    navigator.serviceWorker.ready.then(
      (reg) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(reg);
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}
