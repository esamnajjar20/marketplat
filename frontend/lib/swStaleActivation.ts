/**
 * FIX STALE-SW-AUTO-ACTIVATION-01: a waiting Service Worker that the
 * user never activates — because the PWA tab has been open in the
 * background for days, or on iOS the app was "closed" but retained in
 * memory — keeps the entire browser on the previous CACHE_VERSION.
 * None of the fetch-strategy or route-fallback fixes reach that user
 * until they explicitly close every tab. This module activates the
 * waiting worker without user intervention once it has been waiting
 * for FORCE_ACTIVATE_AFTER_MS *continuously*.
 *
 * Safety nets (SW-AUTOUPDATE-01's infinite-update-loop risk is real):
 *   1. Only fires when a waiting worker has existed continuously for
 *      >= 48h — a normal UpdatePrompt-driven activation resets the
 *      timer via `controllerchange` before the deadline.
 *   2. Per-tab `sessionStorage` guard prevents re-firing after a
 *      manual reload in the same session.
 *   3. Module is a no-op if Service Workers are unsupported or the
 *      registration never becomes ready.
 *   4. Re-evaluates on visibilitychange — mobile browsers freeze
 *      timers while the tab is hidden, so a PWA that wakes up after
 *      hours of backgrounding may have missed many hourly checks.
 */
'use client';

const FORCE_ACTIVATE_AFTER_MS = 48 * 60 * 60 * 1000; // 48 hours
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const FIRED_KEY = 'marketplat:sw-stale-activation-fired';

let waitingSince: number | null = null;
let timerId: ReturnType<typeof setInterval> | null = null;
// FIX SW-STALE-INIT-GUARD-01: the previous guard checked `timerId !== null`
// before the async setup had run — `timerId` is only assigned *inside* the
// serviceWorker.ready.then() callback, so two synchronous calls in the same
// tick both passed the guard and created two intervals. This flag is set
// synchronously, closing that window even though today's only caller
// (OfflineBootstrap's module-level `__offlineBootstrapInitialized` guard)
// happens to prevent the double call.
let initRequested = false;
let visibilityListenerAttached = false;

function alreadyFiredInThisTab(): boolean {
  try {
    return sessionStorage.getItem(FIRED_KEY) === '1';
  } catch {
    return false;
  }
}

function markFired(): void {
  try {
    sessionStorage.setItem(FIRED_KEY, '1');
  } catch {
    // ignore
  }
}

function evaluate(reg: ServiceWorkerRegistration): void {
  if (alreadyFiredInThisTab()) return;
  if (reg.waiting) {
    if (waitingSince === null) waitingSince = Date.now();
  } else {
    waitingSince = null;
    return;
  }
  if (Date.now() - waitingSince >= FORCE_ACTIVATE_AFTER_MS) {
    try {
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
      markFired();
    } catch {
      // best-effort: next tick retries
    }
  }
}

export function initStaleWaitingServiceWorkerHandler(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (initRequested) return; // already initialized in this module instance
  initRequested = true;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    waitingSince = null;
  });

  void navigator.serviceWorker.ready
    .then((reg) => {
      evaluate(reg);
      timerId = setInterval(() => evaluate(reg), CHECK_INTERVAL_MS);
      if (!visibilityListenerAttached) {
        visibilityListenerAttached = true;
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') evaluate(reg);
        });
      }
    })
    .catch(() => {
      // No SW in this environment — nothing to do.
    });
}
