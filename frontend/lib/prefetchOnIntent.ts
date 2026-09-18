/**
 * SLOW-NET phase2: on hover/focus, warm the next page without blocking paint.
 * Deduped per key; work runs in requestIdleCallback (or short timeout).
 */
'use client';

import { getQueryClient } from '@/lib/queryClient';

const scheduled = new Set<string>();

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

/** Fire once per key when the user shows intent (hover / keyboard focus). */
export function onIntentPrefetch(key: string, work: () => void | Promise<void>) {
  if (typeof window === 'undefined' || scheduled.has(key)) return;
  scheduled.add(key);
  runWhenIdle(() => {
    void Promise.resolve(work()).catch(() => {
      /* prefetch is best-effort */
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
