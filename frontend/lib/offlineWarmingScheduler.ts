'use client';

/**
 * lib/offlineWarmingScheduler.ts
 *
 * WHEN to warm (the pipeline decides WHAT is stale — this decides when it is
 * polite to ask). Replaces OfflineBootstrap's "fire immediately on mount /
 * online / auth + one 6h timer".
 *
 * Problems with the old timing (measured against the code, Gaza-first):
 *  1. Warming started in the same tick as hydration — ~40 background
 *     requests raced the page's own first requests on a 20 KB/s link.
 *  2. mount + auth + online each started their own run → up to three
 *     back-to-back pipelines (the later ones only chained via a rerun flag).
 *  3. A flapping connection fired one run per `online` event, immediately,
 *     before the link had even settled.
 *  4. The only periodic trigger was a 6h setInterval. Timers freeze in a
 *     backgrounded PWA, so a user who kept the app open all day and then went
 *     offline had data up to a day old; user-data (messages, notifications)
 *     has a freshness window of minutes, not hours.
 *
 * Rules implemented here:
 *  - Coalesce: any number of triggers inside the delay window → ONE run
 *    (authenticated flags are OR-ed, so a late login upgrades the pending run).
 *  - Defer: wait for `load`, then a per-trigger delay (doubled on very slow
 *    links), then `requestIdleCallback` — page content always goes first.
 *  - Visible only: never warm while the tab is hidden; the pending run stays
 *    queued and is armed again on the next `visible` trigger.
 *  - Rate-limit the cheap triggers (online / visible / tick): at most one
 *    pipeline start per MIN_GAP_MS, unless a login just made the run richer.
 *  - Cheap tick: TICK_MS while visible. Safe because every its own
 *    freshness gate (shells 6h/24h, core by network tier, user-data 10min/2h).
 */

import { getLastPipelineRun, runWarmingPipeline } from './offlineWarmingPipeline';
import { getWarmingPlan } from './offlineWarmingPlanner';
import { getNetworkPolicy } from './networkPolicy';

export type WarmTrigger = 'mount' | 'auth' | 'online' | 'visible' | 'tick';

/** Delay before a run of this trigger starts (ms). */
export const TRIGGER_DELAY_MS: Record<WarmTrigger, number> = {
  mount: 3_000, // let the first paint + its own requests finish
  auth: 1_500, // login/restore already happened after load
  online: 4_000, // a flapping link needs a moment to prove it is stable
  visible: 1_500,
  tick: 0,
};

/** Minimum spacing between pipeline starts for online/visible/tick. */
export const MIN_GAP_MS = 2 * 60 * 1000;

/** Period of the in-app freshness tick (only fires while visible + online). */
export const TICK_MS = 10 * 60 * 1000;

interface Pending {
  authenticated: boolean;
}

let pending: Pending | null = null;
let timer: number | null = null;
let loadListener: (() => void) | null = null;

const RATE_LIMITED: ReadonlySet<WarmTrigger> = new Set(['online', 'visible', 'tick']);

function runWhenIdle(cb: () => void): void {
  const ric = (window as Window & {
    requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof ric === 'function') {
    ric(cb, { timeout: 5_000 });
  } else {
    window.setTimeout(cb, 0);
  }
}

function start(): void {
  const job = pending;
  if (!job) return;
  pending = null;
  void runWarmingPipeline({
    authenticated: job.authenticated,
  }).catch((err) => {
    console.warn('[offline] runWarmingPipeline failed:', err);
  });
}

function fire(): void {
  timer = null;
  if (!pending) return;
  // Hidden tab: keep the pending run; the next 'visible' trigger re-arms it.
  if (document.visibilityState === 'hidden') return;

  if (document.readyState !== 'complete') {
    if (loadListener) return; // already waiting for load
    loadListener = () => {
      loadListener = null;
      runWhenIdle(start);
    };
    window.addEventListener('load', loadListener, { once: true });
    return;
  }
  runWhenIdle(start);
}

/**
 * Ask for a warming pass. Cheap to call as often as you like — see the rules
 * in the file header.
 */
export function scheduleWarming(
  trigger: WarmTrigger,
  opts: { authenticated: boolean },
): void {
  if (typeof window === 'undefined') return;

  const policy = getNetworkPolicy();
  if (policy.tier === 'offline' || !policy.allowBackgroundWarming) return;

  const last = getLastPipelineRun();
  const upgradesToAuthenticated = opts.authenticated && !last.authenticated;
  const limited =
    RATE_LIMITED.has(trigger) &&
    Date.now() - last.startedAt < MIN_GAP_MS &&
    !upgradesToAuthenticated;

  // A rate-limited trigger may not create work, but it must still be able to
  // re-arm a run that was parked while the tab was hidden.
  if (limited && !pending) return;

  if (!limited) {
    pending = {
      authenticated: (pending?.authenticated ?? false) || opts.authenticated,
      // Only the background tick may skip the queue wait, and only when every
      // trigger merged into this run was a tick.
    };
  }

  if (timer !== null) return; // coalesce into the run already armed
  const slowFactor = getWarmingPlan().tier === 'critical' ? 2 : 1;
  timer = window.setTimeout(fire, TRIGGER_DELAY_MS[trigger] * slowFactor);
}

/** Drop any armed/pending run (component unmount). */
export function cancelScheduledWarming(): void {
  if (timer !== null && typeof window !== 'undefined') window.clearTimeout(timer);
  timer = null;
  pending = null;
  if (loadListener && typeof window !== 'undefined') {
    window.removeEventListener('load', loadListener);
  }
  loadListener = null;
}
