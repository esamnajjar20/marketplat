/**
 * __tests__/unit/lib/queryClient.test.ts
 *
 * Coverage targets:
 *  - makeQueryClient: creates a QueryClient with correct default options
 *  - shouldRetry (via defaultOptions.queries.retry):
 *    * network error (status 0) → retry on first failure, not second
 *    * 5xx → retry once
 *    * 4xx → never retry
 *    * 401/403/404/409/422/429 → never retry
 *  - getQueryClient: returns browser singleton
 *  - getQueryClient: creates new instance on each SSR call
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { ParsedError } from '@/lib/errorParser';

// ── Helpers ───────────────────────────────────────────────────────

function makeParsedError(statusCode: number): ParsedError {
  return { message: 'error', statusCode };
}

/**
 * Extract the retry function from a QueryClient's defaultOptions.
 * We use the retry option directly — TanStack stores it as-is.
 */
function getRetryFn(client: QueryClient) {
  return client.getDefaultOptions().queries?.retry as
    | ((failureCount: number, error: unknown) => boolean)
    | undefined;
}

// ── makeQueryClient ───────────────────────────────────────────────

describe('makeQueryClient', () => {
  let makeQueryClient: () => QueryClient;

  beforeEach(async () => {
    vi.resetModules();
    ({ makeQueryClient } = await import('@/lib/queryClient'));
  });

  it('creates a QueryClient instance', () => {
    expect(makeQueryClient()).toBeInstanceOf(QueryClient);
  });

  it('sets staleTime to 60 000 ms', () => {
    const qc = makeQueryClient();
    expect(qc.getDefaultOptions().queries?.staleTime).toBe(60_000);
  });

  it('sets gcTime to 5 minutes', () => {
    const qc = makeQueryClient();
    expect(qc.getDefaultOptions().queries?.gcTime).toBe(5 * 60_000);
  });

  it('sets refetchOnWindowFocus to false', () => {
    const qc = makeQueryClient();
    expect(qc.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(false);
  });

  it('sets mutation retry to 0', () => {
    const qc = makeQueryClient();
    expect(qc.getDefaultOptions().mutations?.retry).toBe(0);
  });

  it('sets a custom retry function (not a boolean/number)', () => {
    const qc = makeQueryClient();
    expect(typeof qc.getDefaultOptions().queries?.retry).toBe('function');
  });
});

// ── shouldRetry logic (API-INT-04 FIX) ───────────────────────────

describe('shouldRetry (via QueryClient defaultOptions)', () => {
  let makeQueryClient: () => QueryClient;

  beforeEach(async () => {
    vi.resetModules();
    ({ makeQueryClient } = await import('@/lib/queryClient'));
  });

  function retry(client: QueryClient, failureCount: number, statusCode: number): boolean {
    const fn = getRetryFn(client);
    if (!fn) throw new Error('No retry function found');
    return fn(failureCount, makeParsedError(statusCode));
  }

  // ── Network errors (status 0) ─────────────────────────────────

  it('retries network error (status 0) on first failure', () => {
    const qc = makeQueryClient();
    expect(retry(qc, 0, 0)).toBe(true);
  });

  it('does NOT retry network error on second failure (failureCount >= 1)', () => {
    const qc = makeQueryClient();
    expect(retry(qc, 1, 0)).toBe(false);
  });

  // ── 5xx server errors ─────────────────────────────────────────

  it('retries 500 on first failure', () => {
    const qc = makeQueryClient();
    expect(retry(qc, 0, 500)).toBe(true);
  });

  it('retries 503 on first failure', () => {
    const qc = makeQueryClient();
    expect(retry(qc, 0, 503)).toBe(true);
  });

  it('does NOT retry 500 on second failure', () => {
    const qc = makeQueryClient();
    expect(retry(qc, 1, 500)).toBe(false);
  });

  // ── 4xx client errors — NEVER retry ──────────────────────────

  it('does NOT retry 400 (client error)', () => {
    const qc = makeQueryClient();
    expect(retry(qc, 0, 400)).toBe(false);
  });

  it('does NOT retry 401 (auth error)', () => {
    const qc = makeQueryClient();
    expect(retry(qc, 0, 401)).toBe(false);
  });

  it('does NOT retry 403 (forbidden)', () => {
    const qc = makeQueryClient();
    expect(retry(qc, 0, 403)).toBe(false);
  });

  it('does NOT retry 404 (not found)', () => {
    const qc = makeQueryClient();
    expect(retry(qc, 0, 404)).toBe(false);
  });

  it('does NOT retry 409 (conflict)', () => {
    const qc = makeQueryClient();
    expect(retry(qc, 0, 409)).toBe(false);
  });

  it('does NOT retry 422 (validation)', () => {
    const qc = makeQueryClient();
    expect(retry(qc, 0, 422)).toBe(false);
  });

  it('does NOT retry 429 (rate limit)', () => {
    const qc = makeQueryClient();
    expect(retry(qc, 0, 429)).toBe(false);
  });
});

// ── getQueryClient — browser singleton / SSR isolation ────────────

describe('getQueryClient', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('returns the same instance on repeated calls in browser', async () => {
    // Ensure window is defined (browser context — jsdom handles this)
    const { getQueryClient } = await import('@/lib/queryClient');
    const a = getQueryClient();
    const b = getQueryClient();
    expect(a).toBe(b); // same reference
  });

  it('returns a fresh instance on each SSR call (no window)', async () => {
    vi.stubGlobal('window', undefined);
    const { getQueryClient } = await import('@/lib/queryClient');
    const a = getQueryClient();
    const b = getQueryClient();
    // On the server, each call must return a new client to avoid shared state
    expect(a).not.toBe(b);
  });

  it('browser singleton is a QueryClient', async () => {
    const { getQueryClient } = await import('@/lib/queryClient');
    expect(getQueryClient()).toBeInstanceOf(QueryClient);
  });
});
