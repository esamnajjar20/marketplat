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

import { runWarmingEngine } from '@/lib/warmingEngine';
import { getBackgroundWarmingBudget, shouldPauseBackgroundWarming } from '@/lib/offlineStoragePressure';
import { getNetworkPolicy } from '@/lib/networkPolicy';

let pipelineInFlight = false;
// WARM-PIPELINE-QUEUE-01: when a warm pass starts before auth has
// hydrated, it runs with authenticated:false and never touches the
// personal shells or user-data caches. The later authenticated:true
// call (from the auth effect) then hits pipelineInFlight and is
// silently dropped — personal routes stay unfilled for up to 6h
// until the next periodic timer. Tracking that here lets us re-run
// the personal phase automatically when the first pass finishes.
let pendingAuthenticatedRerun = false;
// Read by offlineWarmingScheduler to rate-limit the cheap "tick / visible /
// online" triggers (each phase already has its own freshness gate, this only
// avoids re-entering the pipeline needlessly on a flapping connection).
let lastPipelineStartedAt = 0;
let lastPipelineAuthenticated = false;
export function getLastPipelineRun(): { startedAt: number; authenticated: boolean } {
  return { startedAt: lastPipelineStartedAt, authenticated: lastPipelineAuthenticated };
}
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

function waitForQueueReplayIdle(timeoutMs = 90_000): Promise<boolean> {
  if (!queueReplayInFlight) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      cleanup();
      // Never start background warming alongside a still-running queue drain.
      // On weak links the queue can legitimately exceed the old 45s timeout;
      // returning false lets the scheduler try again later without stealing
      // bandwidth from the user's pending mutations.
      resolve(false);
    }, timeoutMs);
    const onIdle = () => {
      cleanup();
      resolve(true);
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
  const online = navigator.onLine;
  if (!online) return { ran: false };
  if (pipelineInFlight) {
    // WARM-PIPELINE-QUEUE-01: see the flag's doc comment. Only a
    // *later* authenticated run is worth remembering — a plain repeat
    // of the same pass has nothing new to add.
    if (options.authenticated) pendingAuthenticatedRerun = true;
    return { ran: false };
  }

  pipelineInFlight = true;
  let result: Awaited<ReturnType<typeof runWarmingEngine>> | undefined;
  try {
    const queueIdle = await waitForQueueReplayIdle();
    if (!queueIdle) return { ran: false };

    // Storage quota is shared by Cache Storage + IndexedDB. Never let a
    // background warming pass compete with drafts or queued mutations when
    // the origin is already critically full.
    if (!options.force && (await shouldPauseBackgroundWarming())) {
      return { ran: false };
    }
    const storageBudget = options.force ? 'full' : await getBackgroundWarmingBudget();
    if (storageBudget === 'paused') return { ran: false };

    lastPipelineStartedAt = Date.now();
    if (options.authenticated) lastPipelineAuthenticated = true;

    // Re-check the live connection after waiting for queue replay/storage.
    // `online` is only a snapshot from function entry and may be stale after
    // a long wait or a connection drop.
    if (!navigator.onLine) return { ran: false };

    // W0-W3 + Cache W7: engine owns network budget + priority, storage
    // gates the phases. Network budget is still enforced by the engine;
    // storage budget decides how many phases run.
    result = await runWarmingEngine({
      authenticated: options.authenticated === true && storageBudget === 'full',
      force: options.force === true,
    });
    if (result.skipped.length > 0) {
      const policy = getNetworkPolicy();
      // Explain expected admission-control skips instead of emitting a vague
      // warning that looks like an exception. Keep IDs and live policy together
      // so production reports can distinguish network limits from storage.
      console.info('[warm-pipeline] jobs skipped by adaptive budget', {
        jobs: result.skipped,
        tier: policy.tier,
        saveData: policy.saveData,
        allowBackgroundWarming: policy.allowBackgroundWarming,
        maxRequests: result.budget.maxRequests,
        maxBytes: result.budget.maxBytes,
      });
    }
  } finally {
    pipelineInFlight = false;
    // WARM-PIPELINE-QUEUE-01: if an authenticated run arrived while
    // this one was in flight, chain it now. Once so: the first pass
    // already warmed core + public, this one adds personal + user
    // data. The queued mutation remains the higher-priority workload.
    if (pendingAuthenticatedRerun) {
      pendingAuthenticatedRerun = false;
      void runWarmingPipeline({ authenticated: true });
    }
  }
  return { ran: result?.ran ?? false };
}
