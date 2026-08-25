/**
 * __tests__/unit/hooks/useAdsForHome.test.tsx
 *
 * Coverage targets (audit §10, Ads):
 *  - gps-current/gps-saved → GET /search?type=ads&sort=distance (searchApi.search)
 *  - city → GET /ads?city= (adsApi.getAll)
 *  - fallback → GET /ads with no city (adsApi.getAll)
 *  - GPS query failure → cascades to general /ads
 *  - GPS query empty → cascades to general /ads
 *  - city query failure → cascades to general /ads
 *  - city query empty → cascades to general /ads
 *  - loading states surface correctly per branch
 *  - result item `kind` discriminant matches the endpoint actually used
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAdsForHome } from '@/hooks/queries/useAdsForHome';
import { useLocationResolver } from '@/hooks/useLocationResolver';
import { adsApi } from '@/api/ads.api';
import { searchApi } from '@/api/search.api';

vi.mock('@/hooks/useLocationResolver', () => ({
  useLocationResolver: vi.fn(),
}));

vi.mock('@/api/ads.api', () => ({
  adsApi: { getAll: vi.fn() },
}));

vi.mock('@/api/search.api', () => ({
  searchApi: { search: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function mockLocation(overrides: Record<string, unknown>) {
  (useLocationResolver as ReturnType<typeof vi.fn>).mockReturnValue({
    source: 'fallback',
    isLoading: false,
    requestLocation: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (adsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { items: [], meta: {} } } });
  (searchApi.search as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { items: [], meta: {} } } });
});

describe('useAdsForHome', () => {
  it('gps-current: calls searchApi.search with type=ads, lat/lng, sort=distance', async () => {
    mockLocation({ source: 'gps-current', latitude: 31.5, longitude: 34.45 });
    (searchApi.search as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 's1', type: 'ad' }], meta: {} } },
    });

    const { result } = renderHook(() => useAdsForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('gps'));
    expect(searchApi.search).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ads', lat: 31.5, lng: 34.45, sort: 'distance' }),
    );
    // The city-filtered branch is disabled (enabled: isCity === false) while
    // GPS is the active source — TanStack Query must not fire its HTTP
    // request at all. adsApi.getAll should only ever see the one call from
    // the always-on general/cascade-target query, never a second one for
    // the disabled city branch (Rules of Hooks means useAds() is still
    // *called* here, but `enabled: false` must suppress the actual fetch).
    expect(adsApi.getAll).toHaveBeenCalledTimes(1);
    expect(adsApi.getAll).not.toHaveBeenCalledWith(expect.objectContaining({ city: expect.anything() }));
    expect(result.current.items.kind).toBe('search');
    expect(result.current.items.data).toHaveLength(1);
  });

  it('gps-saved: also routes through searchApi.search (same as gps-current)', async () => {
    mockLocation({ source: 'gps-saved', latitude: 1, longitude: 2 });
    (searchApi.search as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 's1', type: 'ad' }], meta: {} } },
    });

    const { result } = renderHook(() => useAdsForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('gps'));
    expect(searchApi.search).toHaveBeenCalled();
  });

  it('city: calls adsApi.getAll with city param, not searchApi', async () => {
    mockLocation({ source: 'city', city: 'غزة' });
    (adsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'a1' }], meta: {} } },
    });

    const { result } = renderHook(() => useAdsForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('city'));
    expect(adsApi.getAll).toHaveBeenCalledWith(expect.objectContaining({ city: 'غزة' }));
    // Exactly two calls expected: the enabled city-filtered query plus the
    // always-on general query (the cascade-safety-net that stays enabled
    // regardless of source — see useAdsForHome's own doc). No third,
    // unexpected call.
    expect(adsApi.getAll).toHaveBeenCalledTimes(2);
    // useSearch is always mounted (Rules of Hooks) and may be invoked
    // with undefined params outside the GPS branch — that is not a
    // geo search. Assert no call carried real lat/lng/type=ads params.
    const geoSearchCalls = (searchApi.search as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([params]: [{ lat?: number; lng?: number; type?: string } | undefined]) =>
        params != null && (params.lat != null || params.lng != null || params.type === 'ads'),
    );
    expect(geoSearchCalls).toHaveLength(0);
    expect(result.current.items.kind).toBe('ads');
  });

  it('fallback: calls adsApi.getAll with no city, no searchApi call', async () => {
    mockLocation({ source: 'fallback' });
    (adsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'a1' }], meta: {} } },
    });

    const { result } = renderHook(() => useAdsForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    const geoSearchCalls = (searchApi.search as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([params]: [{ lat?: number; lng?: number; type?: string } | undefined]) =>
        params != null && (params.lat != null || params.lng != null || params.type === 'ads'),
    );
    expect(geoSearchCalls).toHaveLength(0);
    expect(adsApi.getAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 8, sortBy: 'createdAt', sortOrder: 'desc' }),
    );
    // No call carried a real city filter — the general/unfiltered branch never sends one.
    const cityCall = (adsApi.getAll as ReturnType<typeof vi.fn>).mock.calls.find(
      ([params]: [{ city?: string }]) => typeof params?.city === 'string',
    );
    expect(cityCall).toBeUndefined();
  });

  it('GPS query failure cascades to general /ads', async () => {
    mockLocation({ source: 'gps-current', latitude: 1, longitude: 2 });
    (searchApi.search as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('geo search failed'));
    (adsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'fallback-ad' }], meta: {} } },
    });

    const { result } = renderHook(() => useAdsForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    expect(result.current.items.kind).toBe('ads');
    expect(result.current.items.data).toHaveLength(1);
  });

  it('GPS query empty result cascades to general /ads', async () => {
    mockLocation({ source: 'gps-current', latitude: 1, longitude: 2 });
    (searchApi.search as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { items: [], meta: {} } } });
    (adsApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'fallback-ad' }], meta: {} } },
    });

    const { result } = renderHook(() => useAdsForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    expect(result.current.items.data).toHaveLength(1);
  });

  it('city query failure cascades to general /ads', async () => {
    mockLocation({ source: 'city', city: 'رفح' });
    (adsApi.getAll as ReturnType<typeof vi.fn>).mockImplementation((params?: { city?: string }) => {
      if (params?.city === 'رفح') return Promise.reject(new Error('city query failed'));
      return Promise.resolve({ data: { data: { items: [{ id: 'general-ad' }], meta: {} } } });
    });

    const { result } = renderHook(() => useAdsForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    expect(result.current.items.data).toHaveLength(1);
  });

  it('city query empty result cascades to general /ads', async () => {
    mockLocation({ source: 'city', city: 'رفح' });
    (adsApi.getAll as ReturnType<typeof vi.fn>).mockImplementation((params?: { city?: string }) => {
      if (params?.city === 'رفح') return Promise.resolve({ data: { data: { items: [], meta: {} } } });
      return Promise.resolve({ data: { data: { items: [{ id: 'general-ad' }], meta: {} } } });
    });

    const { result } = renderHook(() => useAdsForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    expect(result.current.items.data).toHaveLength(1);
  });

  it('exposes isChecking from the resolver while it is still resolving', () => {
    mockLocation({ source: 'fallback', isLoading: true });
    const { result } = renderHook(() => useAdsForHome(), { wrapper: createWrapper() });
    expect(result.current.isChecking).toBe(true);
  });
});
