/**
 * Coverage targets:
 *
 *  useAds / useMyAds / useUserAds:
 *   - call the right API method with the right params
 *   - useMyAds calls /ads/me (regression guard for the historical
 *     /ads/my typo, FIX C-06 — already covered at the API layer in
 *     thin-wrappers.test.ts, repeated here at the hook layer since
 *     that's the layer components actually consume)
 *
 *  useSearchAds:
 *   - REGRESSION (FIX API-INT-06): does not crash and is simply
 *     disabled when q is undefined, rather than calling
 *     undefined.trim() — this was a real crash before the fix
 *   - disabled when q is shorter than 2 characters (after trimming)
 *   - enabled once q reaches 2+ trimmed characters
 *
 *  useAd / useRelatedAds / useUserAds:
 *   - disabled (no request fired) when the id/userId is empty
 *   - enabled once a real id is provided
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAds, useSearchAds, useAd, useRelatedAds, useMyAds, useUserAds } from '@/hooks/queries/useAds';
import { adsApi } from '@/api/ads.api';
import { usersApi } from '@/api/users.api';

vi.mock('@/api/ads.api', () => ({
  adsApi: { getAll: vi.fn(), searchAds: vi.fn(), getById: vi.fn(), getRelated: vi.fn(), getMyAds: vi.fn() },
}));

vi.mock('@/api/users.api', () => ({
  usersApi: { getUserAds: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  (adsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { items: [], meta: {} } } });
  (adsApi.searchAds as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { items: [], meta: {} } } });
  (adsApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { id: 'ad-1' } } });
  // FIX API-SHAPE-02: getRelated's backend endpoint is NOT paginated —
  // `data` is a bare array, unlike getAll/searchAds/getMyAds below
  // which go through unwrapPaginated and resolve to { items, meta }.
  (adsApi.getRelated as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: [] } });
  (adsApi.getMyAds as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { items: [], meta: {} } } });
  (usersApi.getUserAds as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { items: [], meta: {} } } });
});

describe('useAds', () => {
  it('calls adsApi.getAll with the given params', async () => {
    const { result } = renderHook(() => useAds({ page: 2, city: 'غزة' }), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adsApi.getAll).toHaveBeenCalledWith({ page: 2, city: 'غزة' });
  });

  // FIX PERF-04: SearchResults.tsx calls both useAds and useSearchAds
  // unconditionally (Hooks can't be conditional) and picks the right
  // result based on isSearch — without this opt-out, useAds fired a
  // fully wasted GET /ads on every real search alongside GET /ads/search.
  it('does not call adsApi.getAll when enabled: false is passed', async () => {
    renderHook(() => useAds({ page: 1 }, { enabled: false }), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(adsApi.getAll).not.toHaveBeenCalled();
  });

  it('still calls adsApi.getAll by default when no options are passed (backward compatible)', async () => {
    const { result } = renderHook(() => useAds({ page: 1 }), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adsApi.getAll).toHaveBeenCalledWith({ page: 1 });
  });
});

describe('useSearchAds', () => {
  it('REGRESSION (FIX API-INT-06): does not throw and stays disabled when q is undefined', () => {
    expect(() =>
      renderHook(() => useSearchAds({} as any), { wrapper: createWrapper() }),
    ).not.toThrow();
    expect(adsApi.searchAds).not.toHaveBeenCalled();
  });

  it('stays disabled for a query shorter than 2 trimmed characters', async () => {
    renderHook(() => useSearchAds({ q: ' a ' }), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(adsApi.searchAds).not.toHaveBeenCalled();
  });

  it('stays disabled for an empty/whitespace-only query', async () => {
    renderHook(() => useSearchAds({ q: '   ' }), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(adsApi.searchAds).not.toHaveBeenCalled();
  });

  it('fires the search once the trimmed query reaches 2+ characters', async () => {
    const { result } = renderHook(() => useSearchAds({ q: 'phone' }), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adsApi.searchAds).toHaveBeenCalledWith({ q: 'phone' });
  });
});

describe('useAd', () => {
  it('does not call adsApi.getById when id is empty', async () => {
    renderHook(() => useAd(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(adsApi.getById).not.toHaveBeenCalled();
  });

  it('calls adsApi.getById once a real id is provided', async () => {
    const { result } = renderHook(() => useAd('ad-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adsApi.getById).toHaveBeenCalledWith('ad-1');
  });
});

describe('useRelatedAds', () => {
  it('does not call adsApi.getRelated when id is empty', async () => {
    renderHook(() => useRelatedAds(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(adsApi.getRelated).not.toHaveBeenCalled();
  });

  it('returns an empty array (not undefined) when the response has no items', async () => {
    (adsApi.getRelated as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: undefined } });
    const { result } = renderHook(() => useRelatedAds('ad-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe('useMyAds', () => {
  it('calls adsApi.getMyAds (the /ads/me endpoint, not /ads/my)', async () => {
    const { result } = renderHook(() => useMyAds({ page: 1, status: 'ACTIVE' as any }), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(adsApi.getMyAds).toHaveBeenCalledWith({ page: 1, status: 'ACTIVE' });
  });
});

describe('useUserAds', () => {
  it('does not call usersApi.getUserAds when userId is empty', async () => {
    renderHook(() => useUserAds(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(usersApi.getUserAds).not.toHaveBeenCalled();
  });

  it('calls usersApi.getUserAds once a real userId is provided', async () => {
    const { result } = renderHook(() => useUserAds('user-1', { page: 1 }), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(usersApi.getUserAds).toHaveBeenCalledWith('user-1', { page: 1 });
  });
});
