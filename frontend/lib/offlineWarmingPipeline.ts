/**
 * FIX WARM-PIPELINE-01: single orchestrator for offline warming.
 *
 * Previously OfflineBootstrap fired core + public shells + personal +
 * user-data in parallel — four independent locks that still competed for
 * the same 20 KB/s uplink. On online events, queue replay raced with
 * warming and lost (user's pending ad/message waited behind shell fetches).
 *
 * Pipeline order:
 *   1. Wait until queue replay is not in-flight (or timeout)
 *   2. Core API bundle (categories / featured — small JSON)
 *   3. Public route shells (browse paths)
 *   4. Personal shells (if authenticated)
 *   5. User-data + self-profile JSON
 *
 * Only one pipeline runs at a time (module-level inFlight).
 */
'use client';

import { warmCoreBundle } from '@/lib/offlineCoreBundle';
import { warmRouteShellsAtomic, warmPersonalShellsAtomic } from '@/lib/offlineRouteShells';
import { warmUserData } from '@/lib/offlineWarmingUserData';

let pipelineInFlight = false;
let queueReplayInFlight = false;
let queueReplayWaiters: Array<() => void> = [];

/** Call when offline queue drain starts / ends (from OfflineBootstrap). */
export function setQueueReplayInFlight(active: boolean): void {
  queueReplayInFlight = active;
  if (!active) {
    const waiters = queueReplayWaiters;
    queueReplayWaiters = [];
    for (const w of waiters) w();
  }
}

export function isQueueReplayInFlight(): boolean {
  return queueReplayInFlight;
}

function waitForQueueReplayIdle(timeoutMs = 45_000): Promise<void> {
  if (!queueReplayInFlight) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    const onIdle = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      queueReplayWaiters = queueReplayWaiters.filter((w) => w !== onIdle);
    };
    queueReplayWaiters.push(onIdle);
  });
}

export type WarmingPipelineOptions = {
  /** Include personal shells + user-data endpoints. */
  authenticated?: boolean;
  /** Skip waiting for queue (e.g. periodic background tick). */
  skipQueueWait?: boolean;
  /** MANUAL-WARM-FORCE-01: user-triggered run — skip the throttle and
   *  freshness checks so the button always produces visible work. */
  force?: boolean;
};

/**
 * Run the full warming sequence. Safe to call from mount / online /
 * visibility — concurrent calls no-op while one is active.
 */
// WARM-RAN-01: returns { ran } so callers (OfflineControlClient) can
// tell whether the pipeline actually executed. Previously a call that
// hit pipelineInFlight (a concurrent run) returned silently, and the
// UI toasted 'finished' anyway — a lie.
export async function runWarmingPipeline(
  options: WarmingPipelineOptions = {},
): Promise<{ ran: boolean }> {
  if (typeof window === 'undefined') return { ran: false };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ran: false };
  if (pipelineInFlight) return { ran: false };

  pipelineInFlight = true;
  try {
    if (!options.skipQueueWait) {
      await waitForQueueReplayIdle();
    }

    // Phase 2 — core JSON bundle (categories, featured listings).
    try {
      await warmCoreBundle();
    } catch (err) {
      console.warn('[warm-pipeline] core failed:', err);
    }

    // Phase 3 — public shells (marketplace browse paths).
    try {
      await warmRouteShellsAtomic(options.force === true);
    } catch (err) {
      console.warn('[warm-pipeline] public shells failed:', err);
    }

    if (options.authenticated) {
      // Phase 4 — personal page shells.
      try {
        await warmPersonalShellsAtomic(options.force === true);
      } catch (err) {
        console.warn('[warm-pipeline] personal shells failed:', err);
      }
      // Phase 5 — auth-scoped API + self profile JSON.
      try {
        await warmUserData();
      } catch (err) {
        console.warn('[warm-pipeline] user data failed:', err);
      }
    }
  } finally {
    pipelineInFlight = false;
  }
  return { ran: true };
}
