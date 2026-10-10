/**
 * TanStack Query client configuration.
 *
 * Defaults are conservative — individual queries override where needed.
 * gcTime > staleTime: data stays in cache after going stale so
 * navigating back to a page shows instant data while revalidating.
 *
 * API-INT-04 FIX: Default retry:1 was retrying ALL errors including 4xx.
 *   Permanent client errors (400/401/403/404/409/422) are not retried.
 *   Transient network/408/429/502/503/504 failures may retry once.
 *   Axios marks a retry it already consumed so TanStack Query does not stack another one.
 */
import { QueryClient } from '@tanstack/react-query';
import { CLIENT_CACHE_DEFAULTS } from '@/lib/cachePolicy';
import {
  getRetryAfterFromParsedError,
  getRetryDelayMs,
  isRetryableParsedError,
  MAX_QUERY_RETRIES,
} from '@/lib/retryPolicy';

/**
 * API-INT-04 FIX: Only retry on network/5xx errors — not client errors.
 * TanStack Query calls this with (failureCount, error). Return true to retry.
 *
 * parseApiError is called by the interceptor before the error reaches here,
 * so we inspect the normalized statusCode/networkRetryCount shape.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) return false;
  // Axios already performs one safe-request retry. Do not stack a second
  // identical retry when that marker is present; non-Axios query errors still
  // receive the single TanStack retry.
  const retryCount = Number((error as { networkRetryCount?: unknown })?.networkRetryCount ?? 0);
  if (retryCount > 0) return false;
  return isRetryableParsedError(error);
}

function retryDelay(failureCount: number, error: unknown): number {
  return getRetryDelayMs(
    failureCount,
    getRetryAfterFromParsedError(error),
  );
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:            CLIENT_CACHE_DEFAULTS.staleTime,  // SLOW-NET phase1 — keep cached UI stable on slow links
        // LOAD-SPEED-01: avoid refetch storms on remount while data is fresh
        gcTime:               CLIENT_CACHE_DEFAULTS.gcTime,
        retry:                shouldRetry,
        retryDelay,   // API-INT-04 FIX: smart retry
        refetchOnWindowFocus: false,
        refetchOnMount: (query) => {
          // QueryOptions typing varies by TanStack version — read safely
          const opts = query.options as { staleTime?: number | typeof Infinity };
          const staleMs = typeof opts.staleTime === 'number' ? opts.staleTime : CLIENT_CACHE_DEFAULTS.staleTime;
          if (!query.state.dataUpdatedAt) return true;
          return Date.now() - query.state.dataUpdatedAt > staleMs;
        },
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

// Singleton for the browser — new instance per request on the server.
let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    // Server: always create a new client (no shared state between requests).
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

/**
 * Cancel active queries before removing their cache entries. `clear()` alone
 * removes cached Query objects but does not express cancellation to observers
 * or abort-aware queryFns. Call this at session boundaries before wiping data.
 */
export async function cancelAndClearQueryClient(
  client: QueryClient = getQueryClient(),
): Promise<void> {
  try {
    await client.cancelQueries();
  } finally {
    client.clear();
  }
}
