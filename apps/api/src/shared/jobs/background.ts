/**
 * Tracks fire-and-forget promises so the test runner can drain them before
 * Jest shuts down. In production: no-op pass-through.
 */
type PendingSet = Set<Promise<unknown>>;

const g = globalThis as unknown as { __bgPending?: PendingSet };
function bucket(): PendingSet {
  if (!g.__bgPending) g.__bgPending = new Set();
  return g.__bgPending;
}

export function track<T>(p: Promise<T>): Promise<T> {
  if (process.env.NODE_ENV !== 'test') return p;
  const set = bucket();
  const wrapped: Promise<unknown> = p.finally(() => set.delete(wrapped));
  set.add(wrapped);
  return p;
}

export async function drainBackground(ms = 2000): Promise<void> {
  if (process.env.NODE_ENV !== 'test') return;
  const set = bucket();
  const start = Date.now();
  while (set.size > 0 && Date.now() - start < ms) {
    await new Promise(r => setTimeout(r, 10));
  }
  if (set.size > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[background] ${set.size} task(s) still pending after ${ms}ms`);
  }
}
