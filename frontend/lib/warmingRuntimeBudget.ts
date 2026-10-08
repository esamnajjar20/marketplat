'use client';

import type { WarmingBudget } from './warmingBudget';

export interface WarmingRuntimeBudgetState {
  requests: number;
  bytes: number;
}

let active: { budget: WarmingBudget; used: WarmingRuntimeBudgetState } | null = null;

/** Install a hard per-pass admission budget around the existing warming phases. */
export function beginWarmingRuntimeBudget(budget: WarmingBudget): () => WarmingRuntimeBudgetState {
  const previous = active;
  active = { budget, used: { requests: 0, bytes: 0 } };
  return () => {
    const result = active?.used ?? { requests: 0, bytes: 0 };
    active = previous;
    return result;
  };
}

/**
 * Reserve one network request. When Content-Length is known, reject a request
 * that cannot fit before opening the connection. Unknown-length responses are
 * admitted once and accounted for when their bytes become observable.
 */
export function reserveWarmingRequest(contentLength?: number): boolean {
  if (!active) return true;
  if (active.used.requests + 1 > active.budget.maxRequests) return false;
  if (Number.isFinite(contentLength) && (contentLength ?? 0) > 0) {
    if (active.used.bytes + (contentLength as number) > active.budget.maxBytes) return false;
  }
  active.used.requests += 1;
  return true;
}

/** Record bytes from a response for the active pass. */
export function recordWarmingRuntimeBytes(bytes: number): boolean {
  if (!active || !Number.isFinite(bytes) || bytes <= 0) return true;
  active.used.bytes += Math.round(bytes);
  return active.used.bytes <= active.budget.maxBytes;
}

export function isWarmingRuntimeBudgetExhausted(): boolean {
  if (!active) return false;
  return active.used.requests >= active.budget.maxRequests || active.used.bytes >= active.budget.maxBytes;
}

export function getWarmingRuntimeBudgetState(): WarmingRuntimeBudgetState | null {
  return active ? { ...active.used } : null;
}
