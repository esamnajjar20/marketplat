/**
 * Intent-driven prefetching with a strict network budget.
 *
 * Prefetch is an optimization, never a critical path. It is disabled on
 * constrained links, touch-only pointer traversal, Data Saver, and when the
 * current policy does not permit it. Work is also re-checked at execution
 * time because the connection can change while an idle callback is waiting.
 */
'use client';

import { getQueryClient } from '@/lib/queryClient';
import { getNetworkPolicy } from '@/lib/networkPolicy';

const PREFETCH_DEDUPE_MS = 2 * 60 * 1000;
const scheduled = new Map<string, number>();
let activePrefetches = 0;

function hasIntentCapablePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return (
    window.matchMedia('(hover: hover) and (pointer: fine)').matches ||
    window.matchMedia('(pointer: fine)').matches
  );
}

function canPrefetch(): boolean {
  if (typeof window === 'undefined') return false;
  if (!navigator.onLine) return false;
  if (!hasIntentCapablePointer()) return false;

  const policy = getNetworkPolicy();
  return policy.allowPrefetch && policy.maxPrefetchConcurrency > 0;
}

function runWhenIdle(fn: () => void) {
  if (typeof window === 'undefined') return;
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof w.requestIdleCallback === 'function') {
    w.requestIdleCallback(() => fn(), { timeout: 1800 });
  } else {
    globalThis.setTimeout(fn, 100);
  }
}

function cleanupExpired(now = Date.now()): void {
  for (const [key, timestamp] of scheduled) {
    if (now - timestamp >= PREFETCH_DEDUPE_MS) scheduled.delete(key);
  }
}

/** Fire once per key per short cooldown when the user shows real intent. */
export function onIntentPrefetch(key: string, work: () => void | Promise<void>) {
  if (typeof window === 'undefined') return;

  const now = Date.now();
  cleanupExpired(now);
  if (scheduled.has(key) || !canPrefetch()) return;

  const policy = getNetworkPolicy();
  if (activePrefetches >= policy.maxPrefetchConcurrency) return;

  scheduled.set(key, now);
  runWhenIdle(() => {
    // Re-check all network gates after the idle delay. A user can move from
    // Wi-Fi to a metered/slow mobile connection while this callback waits.
    if (!canPrefetch()) return;

    const currentPolicy = getNetworkPolicy();
    if (activePrefetches >= currentPolicy.maxPrefetchConcurrency) return;

    activePrefetches += 1;
    void Promise.resolve(work())
      .catch(() => {
        // Prefetch is best-effort. Allow the same intent to be retried after
        // the cooldown rather than permanently poisoning the key.
      })
      .finally(() => {
        activePrefetches = Math.max(0, activePrefetches - 1);
      });
  });
}

/** Warm React Query cache for a detail/list query. */
export function prefetchQueryData<T>(
  queryKey: readonly unknown[],
  fetcher: () => Promise<T>,
  staleTime = 120_000,
) {
  onIntentPrefetch(`qq:${JSON.stringify(queryKey)}`, async () => {
    const client = getQueryClient();
    await client.prefetchQuery({
      queryKey,
      queryFn: fetcher,
      staleTime,
    });
  });
}
