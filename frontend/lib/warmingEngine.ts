'use client';

import { getNetworkPolicy } from './networkPolicy';
import { getWarmingMode } from './warmingPreferences';
import { getWarmingPlan } from './offlineWarmingPlanner';
import { getWarmingBudget, type WarmingBudget } from './warmingBudget';
import { getWarmingJob, type WarmingJobId } from './warmingRegistry';
import { recordWarmingJob } from './warmingTelemetry';
import { WarmingPriorityQueue } from './warmingPriorityQueue';
import { beginWarmingRuntimeBudget, getWarmingRuntimeBudgetState } from './warmingRuntimeBudget';
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

function estimateFits(
  budget: WarmingBudget,
  used: { requests: number; bytes: number; durationMs: number },
  job: ReturnType<typeof getWarmingJob>,
): boolean {
  return (
    used.requests + job.cost.requests <= budget.maxRequests &&
    used.bytes + job.cost.bytes <= budget.maxBytes &&
    used.durationMs + job.cost.durationMs <= budget.maxDurationMs
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
  for (const item of queue.drain()) {
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
      const runtimeAfter = getWarmingRuntimeBudgetState();
      const runtimeDidWork = !runtimeBefore || !runtimeAfter ||
        runtimeAfter.requests > runtimeBefore.requests || runtimeAfter.bytes > runtimeBefore.bytes;
      if (runtimeDidWork) completed.push(item.job.id);
      ok = runtimeDidWork;
    } catch (error) {
      // Warming is strictly best-effort. One broken phase must never prevent
      // lower-priority safety work from running on the same pass.
      failure = error;
    } finally {
      const durationMs = Math.max(item.job.cost.durationMs, Date.now() - startedAt);
      used.requests += item.job.cost.requests;
      used.bytes += item.job.cost.bytes;
      used.durationMs += durationMs;
      recordWarmingJob({
        id: item.job.id,
        ok,
        requests: item.job.cost.requests,
        bytes: item.job.cost.bytes,
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
