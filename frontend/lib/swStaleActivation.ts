/**
 * FIX STALE-SW-AUTO-ACTIVATION-01: a waiting Service Worker that the
 * user never activates — because the PWA tab has been open in the
 * background for days, or on iOS the app was "closed" but retained in
 * memory — keeps the entire browser on the previous CACHE_VERSION.
 * None of the fetch-strategy or route-fallback fixes reach that user
 * until they explicitly close every tab. This module activates the
 * waiting worker without user intervention.
 *
 * Safety nets:
 *   1. Waits FORCE_ACTIVATE_AFTER_MS (5 minutes) before firing. Enough
 *      time for a short interaction to finish, short enough that the
 *      new SW activates within the same session instead of the next day.
 *   2. isUserBusy() refuses to fire while the user has focus in an
 *      input/textarea/contenteditable, has an open draft, or is
 *      selecting text. The next trigger retries within 60s.
 *   3. sessionStorage guard: at most one auto-activation per tab session.
 *   4. controllerchange resets waitingSince so the next deploy's waiting
 *      SW starts a fresh window (UpdatePrompt's manual activation also
 *      resets it cleanly through the same event).
 *   5. initRequested flag prevents double initialization in the same tick.
 *
 * Triggers evaluated in order of naturalness:
 *   - popstate (in-app navigation back/forward) — fires on real user motion
 *   - visibilitychange → visible (returning to the tab)
 *   - setInterval every CHECK_INTERVAL_MS (fallback for long single-page
 *     sessions where the user never navigates and never backgrounds)
 */
'use client';

// SW-ACTIVATION-DELAY-01: reduced from the original 48h. 48h was chosen
// to protect against pathological deploy loops; 5 minutes gives the same
// protection here because the sessionStorage guard makes each tab fire at
// most once, and a pathological deploy still needs a closed/reopened tab
// to re-trigger the auto-activation.
const FORCE_ACTIVATE_AFTER_MS = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL_MS = 60 * 1000; // 60 seconds
const FIRED_KEY = 'marketplat:sw-stale-activation-fired';

let waitingSince: number | null = null;
// FIX SW-STALE-INIT-GUARD-01: set synchronously so two calls in the same
// tick cannot both pass the guard.
let initRequested = false;
let visibilityListenerAttached = false;
let popstateListenerAttached = false;

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

/**
 * SW-ACTIVATION-BUSY-CHECK-01: refuse to reload the page while the user
 * is mid-typing or selecting. A stale-SW activation reloads the whole
 * document — losing an unsaved message or listing is a worse outcome
 * than waiting another 60 seconds for the next check.
 */
function isUserBusy(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const el = document.activeElement as HTMLElement | null;
    if (el) {
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable) return true;
    }
    if (document.querySelector('[data-draft-open="true"]')) return true;
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (sel && sel.toString().length > 0) return true;
  } catch {
    // Defensive: any throw means "unknown", prefer to wait.
    return true;
  }
  return false;
}

function evaluate(reg: ServiceWorkerRegistration): void {
  if (alreadyFiredInThisTab()) return;
  if (reg.waiting) {
    if (waitingSince === null) waitingSince = Date.now();
  } else {
    // No waiting SW. Clear any stale timer so the next deploy starts fresh.
    waitingSince = null;
    return;
  }
  if (Date.now() - waitingSince < FORCE_ACTIVATE_AFTER_MS) return;
  if (isUserBusy()) return;
  try {
    reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
    markFired();
  } catch {
    // best-effort: next tick retries
  }
}

export function initStaleWaitingServiceWorkerHandler(): void {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  if (initRequested) return;
  initRequested = true;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // The waiting SW is now the active controller. Clear local state so
    // a future waiting SW (next deploy) starts a fresh window.
    waitingSince = null;
  });

  void navigator.serviceWorker.ready
    .then((reg) => {
      evaluate(reg);

      // Fallback tick for long single-page sessions where the user
      // never navigates and never backgrounds the tab.
      setInterval(() => evaluate(reg), CHECK_INTERVAL_MS);

      if (!visibilityListenerAttached) {
        visibilityListenerAttached = true;
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') evaluate(reg);
        });
      }

      if (!popstateListenerAttached) {
        popstateListenerAttached = true;
        window.addEventListener('popstate', () => evaluate(reg));
      }
    })
    .catch(() => {
      // No SW in this environment — nothing to do.
    });
}
