/**
 * Decide whether a feature-level local cache may be used after an API read fails.
 * The API client already applies this rule to its own cache; feature caches must
 * follow the same policy so they cannot mask 4xx responses or screen cancellation.
 */
export function canUseStaleCacheAfterReadFailure(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return false;
  if (!error || typeof error !== 'object') return false;

  const failure = error as { status?: unknown; code?: unknown; name?: unknown };
  if (failure.code === 'REQUEST_CANCELLED' || failure.name === 'AbortError') return false;

  if (typeof failure.status === 'number') {
    return failure.status === 429 || failure.status >= 500;
  }

  // Network errors, timeouts, and temporarily missing API configuration have no
  // HTTP status. The API client represents them as ApiError with status undefined.
  return failure.status === undefined;
}
