'use client';

import { getNetworkPolicy } from './networkPolicy';
import { getWarmingMode } from './warmingPreferences';
import { getWarmingPlan } from './offlineWarmingPlanner';
import { getWarmingBudget, type WarmingBudget } from './warmingBudget';
import { getWarmingJob, type WarmingJobId } from './warmingRegistry';
import { recordWarmingJob } from './warmingTelemetry';
import { WarmingPriorityQueue } from './warmingPriorityQueue';
import { beginWarmingRuntimeBudget, getWarmingRuntimeBudgetState } from './warmingRuntimeBudget';
import { getBackgroundWarmingBudget, shouldPauseBackgroundWarming } from './offlineStoragePressure';
import { warmCoreBundle } from './offlineCoreBundle';
import { warmRouteShellsAtomic, warmPersonalShellsAtomic } from './offlineRouteShells';
import { warmUserData } from './offlineWarmingUserData';

export interface WarmingEngineOptions {
  authenticated: boolean;
  force?: boolean;
}

export interface WarmingEngineResult {
  ran: boolean;
  completed: WarmingJobId[];
  skipped: WarmingJobId[];
  budget: WarmingBudget;
}

// A live network downgrade should stop optional background work rather than
// let a plan created on a better connection keep consuming bandwidth.
function estimateFits(
  budget: WarmingBudget,
  used: { requests: number; bytes: number; durationMs: number },
  job: ReturnType<typeof getWarmingJob>,
): boolean {
  // Duration is only a *hint* for telemetry. It must not gate admission,
  // otherwise a slow network turns every pass into "skip everything after
  // the first job". Real cost = requests + bytes.
  return (
    used.requests + job.cost.requests <= budget.maxRequests &&
    used.bytes + job.cost.bytes <= budget.maxBytes
  );
}

/**
 * Unified client warming executor. Existing phase implementations keep their
 * own atomicity/freshness/locks; this layer owns ordering, admission and the
 * global pass budget.
 */
export async function runWarmingEngine(options: WarmingEngineOptions): Promise<WarmingEngineResult> {
  const policy = getNetworkPolicy();
  const mode = getWarmingMode();
  const plan = getWarmingPlan();
  const budget = getWarmingBudget(policy, mode === 'off' ? 'fast' : mode);
  const completed: WarmingJobId[] = [];
  const skipped: WarmingJobId[] = [];

  if (mode === 'off' || plan.tier === 'none' || budget.maxConcurrency === 0) {
    return { ran: false, completed, skipped: [], budget };
  }

  const queue = new WarmingPriorityQueue();
  const jobs: Array<[WarmingJobId, () => Promise<void>]> = [
    ['core-data', () => warmCoreBundle({ force: options.force === true })],
    ['public-routes', () => warmRouteShellsAtomic(options.force === true)],
  ];
  if (options.authenticated) {
    jobs.push(['personal-routes', () => warmPersonalShellsAtomic(options.force === true)]);
    jobs.push(['user-data', () => warmUserData({ force: options.force === true })]);
  }

  for (const [id, run] of jobs) {
    const job = getWarmingJob(id);
    if (job.requiresAuth && !options.authenticated) continue;
    queue.enqueue({ job, run });
  }

  const used = { requests: 0, bytes: 0, durationMs: 0 };
  const endRuntimeBudget = beginWarmingRuntimeBudget(budget);
  try {
  const items = queue.drain();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    // Array indexing is potentially undefined under noUncheckedIndexedAccess.
    // A missing queue item is not executable and must never be dereferenced.
    if (!item) continue;

    // Network/storage can change while a pass is running. Re-check before each
    // phase so a sudden drop to offline/Save-Data or critical quota pressure
    // cannot cause the rest of the background queue to continue blindly.
    const livePolicy = getNetworkPolicy();
    const liveBudget = getWarmingBudget(livePolicy, mode);
    const networkBudgetDowngraded =
      liveBudget.maxRequests < budget.maxRequests ||
      liveBudget.maxBytes < budget.maxBytes ||
      liveBudget.maxConcurrency < budget.maxConcurrency;
    const networkUnavailable =
      (typeof navigator !== 'undefined' && !navigator.onLine) ||
      livePolicy.tier === 'offline' ||
      livePolicy.saveData ||
      !livePolicy.allowBackgroundWarming ||
      networkBudgetDowngraded;
    const storageCritical = !options.force && (await shouldPauseBackgroundWarming());
    const liveStorageBudget = options.force ? 'full' : await getBackgroundWarmingBudget();
    if (networkUnavailable || storageCritical || liveStorageBudget === 'paused') {
      skipped.push(...items.slice(index).map((remaining) => remaining.job.id));
      break;
    }
    if (liveStorageBudget === 'public-only' && item.job.requiresAuth) {
      skipped.push(item.job.id);
      continue;
    }

    if (!estimateFits(budget, used, item.job)) {
      skipped.push(item.job.id);
      continue;
    }
    const startedAt = Date.now();
    const runtimeBefore = getWarmingRuntimeBudgetState();
    let ok = false;
    let failure: unknown;
    try {
      await item.run();
      // A job that ran without throwing is considered successful — even if it
      // made zero network requests (e.g. everything was cached, or the phase
      // legitimately had nothing to do).
      ok = true;
      completed.push(item.job.id);
    } catch (error) {
      // Warming is strictly best-effort. One broken phase must never prevent
      // lower-priority safety work from running on the same pass.
      failure = error;
    } finally {
      const runtimeAfter = getWarmingRuntimeBudgetState();
      // Consume only the *actual* requests/bytes the phase spent, not the
      // pre-estimated job cost. Otherwise a no-op or failed phase would
      // exhaust the pass budget and skip every lower-priority job.
      const actualRequests = (runtimeBefore && runtimeAfter)
        ? Math.max(0, runtimeAfter.requests - runtimeBefore.requests)
        : (ok ? item.job.cost.requests : 0);
      const actualBytes = (runtimeBefore && runtimeAfter)
        ? Math.max(0, runtimeAfter.bytes - runtimeBefore.bytes)
        : (ok ? item.job.cost.bytes : 0);
      const durationMs = Math.max(item.job.cost.durationMs, Date.now() - startedAt);
      used.requests += actualRequests;
      used.bytes += actualBytes;
      // Budget accounting uses the ESTIMATED cost so a slow job cannot
      // starve every lower-priority job behind it. Actual duration is
      // still recorded below for telemetry.
      used.durationMs += item.job.cost.durationMs;
      recordWarmingJob({
        id: item.job.id,
        ok,
        requests: actualRequests,
        bytes: actualBytes,
        durationMs,
        source: 'estimated',
      });
    }
    if (!ok) {
      console.warn('[warming-engine] job failed:', item.job.id, failure);
    }
  }

  } finally {
    endRuntimeBudget();
  }

  return { ran: completed.length > 0, completed, skipped, budget };
}
