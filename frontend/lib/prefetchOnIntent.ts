/**
 * SLOW-NET on hover/focus, warm the next page without blocking paint.
 * Deduped per key; work runs in requestIdleCallback (or short timeout).
 *
 * GHOST-PREFETCH-01: onPointerEnter (the trigger every caller of
 * onIntentPrefetch uses — AdCard/ProductCard/ServiceListingCard) fires as
 * a synthetic event during touch-scroll on devices with no real "hover"
 * concept: the finger sweeping across a card grid registers pointerenter
 * on every card it passes over, not just the one the user actually taps.
 * That was firing router.prefetch()/prefetchQuery() for dozens of cards
 * per scroll — near-simultaneous RSC/query fetches, most aborted before
 * they finished (status 0, unknown type in DevTools' Network panel) —
 * pure waste on the slow/metered mobile connections this app targets.
 * (hover: hover) is false on touch-only devices and true wherever a
 * pointerenter genuinely reflects deliberate intent (mouse/trackpad), so
 * gating on it removes the touch-scroll flood while leaving desktop/
 * trackpad hover-prefetch untouched. Paired with the same saveData/
 * effectiveType guard already used for the favorites idle-prefetch in
 * AuthHydrationProvider, so a hover-capable device on a constrained
 * connection (e.g. a laptop tethered to a slow mobile hotspot) also skips.
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

/** GHOST-PREFETCH-01: true only on a real-hover-capable device with a
 * non-constrained connection — see this file's header comment. */
function canPrefetch(): boolean {
  if (typeof window === 'undefined') return false;

  if (
    typeof window.matchMedia === 'function' &&
    !window.matchMedia('(hover: hover)').matches
  ) {
    return false;
  }

  const conn = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (conn?.saveData) return false;
  const et = conn?.effectiveType;
  if (et === 'slow-2g' || et === '2g' || et === '3g') return false;

  return true;
}

/** Fire once per key when the user shows intent (hover / keyboard focus). */
export function onIntentPrefetch(key: string, work: () => void | Promise<void>) {
  if (typeof window === 'undefined' || scheduled.has(key)) return;
  if (!canPrefetch()) return;
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
