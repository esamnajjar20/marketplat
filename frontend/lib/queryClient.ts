/**
 * TanStack Query client configuration.
 *
 * Defaults are conservative — individual queries override where needed.
 * gcTime > staleTime: data stays in cache after going stale so
 * navigating back to a page shows instant data while revalidating.
 *
 * API-INT-04 FIX: Default retry:1 was retrying ALL errors including 4xx.
 *   Client errors (401/403/404/409/422/429) should never be retried —
 *   the same request will produce the same error.
 *   Only network errors and 5xx (server-side transient failures) should retry.
 */
import { QueryClient } from '@tanstack/react-query';
import type { ParsedError } from '@/lib/errorParser';

/**
 * API-INT-04 FIX: Only retry on network/5xx errors — not client errors.
 * TanStack Query calls this with (failureCount, error). Return true to retry.
 *
 * parseApiError is called by the interceptor before the error reaches here,
 * so we inspect the statusCode on the ParsedError shape.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;         // max 1 retry total

  const status = (error as Partial<ParsedError>)?.statusCode ?? 0;

  // 0 = network error (no response) — always retry once
  if (status === 0) return true;

  // 5xx = server error — retry once (transient failure)
  if (status >= 500) return true;

  // 4xx = client error — do NOT retry (same request = same result)
  return false;
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime:            60_000,
        gcTime:               5 * 60_000,
        retry:                shouldRetry,   // API-INT-04 FIX: smart retry
        refetchOnWindowFocus: false,
        refetchOnMount:       true,
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
