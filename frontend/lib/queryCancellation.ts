/**
 * Distinguishes query cancellation from an actual network failure.
 * Offline query fallbacks must never turn a cancelled request into a
 * successful result containing stale local data.
 */
export function isQueryCancellation(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (!error || typeof error !== 'object') return false;

  const candidate = error as { name?: unknown; code?: unknown; __CANCEL__?: unknown };
  return candidate.name === 'AbortError' ||
    candidate.name === 'CanceledError' ||
    candidate.code === 'ERR_CANCELED' ||
    candidate.__CANCEL__ === true;
}

export function throwIfQueryCancelled(error: unknown, signal?: AbortSignal): void {
  if (isQueryCancellation(error, signal)) throw error;
}
