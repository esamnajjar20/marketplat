/**
 * __tests__/unit/hooks/useNearbyProvidersForHome.test.tsx
 *
 * Coverage targets (audit §10, Home sections / Service Providers):
 *  - gps-current/gps-saved → GET /service-providers/nearby
 *  - city → GET /service-providers?city=
 *  - fallback → GET /service-providers (no city)
 *  - nearby query failure cascades to general directory
 *  - nearby query empty result cascades to general directory
 *  - city query failure cascades to general directory
 *  - city query empty result cascades to general directory
 *  - no duplicate/wasted request: city query is disabled (not fired)
 *    when the resolved source is gps
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useNearbyProvidersForHome } from '@/hooks/queries/useNearbyProvidersForHome';
import { useLocationResolver } from '@/hooks/useLocationResolver';
import { serviceProvidersApi } from '@/api/service-providers.api';

vi.mock('@/hooks/useLocationResolver', () => ({
  useLocationResolver: vi.fn(),
}));

vi.mock('@/api/service-providers.api', () => ({
  serviceProvidersApi: { getAll: vi.fn(), getNearby: vi.fn() },
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
  (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { items: [], meta: {} } } });
  (serviceProvidersApi.getNearby as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { items: [], meta: {} } } });
});

describe('useNearbyProvidersForHome', () => {
  it('gps-current: calls getNearby with lat/lng, not the city-filtered getAll', async () => {
    mockLocation({ source: 'gps-current', latitude: 31.5, longitude: 34.45 });
    (serviceProvidersApi.getNearby as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'p1' }], meta: {} } },
    });

    const { result } = renderHook(() => useNearbyProvidersForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('gps'));
    expect(serviceProvidersApi.getNearby).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 31.5, lng: 34.45 }),
    );
    // The city-filtered branch is disabled (enabled: isCity === false)
    // while GPS is active — its HTTP request must never fire. Only the
    // always-on general/cascade-target query should reach getAll.
    expect(serviceProvidersApi.getAll).toHaveBeenCalledTimes(1);
    expect(serviceProvidersApi.getAll).not.toHaveBeenCalledWith(
      expect.objectContaining({ city: expect.anything() }),
    );
  });

  it('city: calls getAll with city param, not getNearby', async () => {
    mockLocation({ source: 'city', city: 'خان يونس' });
    (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'p1' }], meta: {} } },
    });

    const { result } = renderHook(() => useNearbyProvidersForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('city'));
    expect(serviceProvidersApi.getAll).toHaveBeenCalledWith(expect.objectContaining({ city: 'خان يونس' }));
    // Two expected: the enabled city-filtered query plus the always-on
    // general query (cascade-safety-net) — no unexpected third call.
    expect(serviceProvidersApi.getAll).toHaveBeenCalledTimes(2);
    expect(serviceProvidersApi.getNearby).not.toHaveBeenCalled();
  });

  it('fallback: calls getAll with no city', async () => {
    mockLocation({ source: 'fallback' });
    (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'p1' }], meta: {} } },
    });

    const { result } = renderHook(() => useNearbyProvidersForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    const cityCall = (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mock.calls.find(
      ([params]: [{ city?: string }]) => typeof params?.city === 'string',
    );
    expect(cityCall).toBeUndefined();
  });

  it('nearby query failure cascades to the general directory', async () => {
    mockLocation({ source: 'gps-current', latitude: 1, longitude: 2 });
    (serviceProvidersApi.getNearby as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nearby failed'));
    (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'general-p' }], meta: {} } },
    });

    const { result } = renderHook(() => useNearbyProvidersForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('nearby query empty result cascades to the general directory', async () => {
    mockLocation({ source: 'gps-current', latitude: 1, longitude: 2 });
    (serviceProvidersApi.getNearby as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { items: [], meta: {} } } });
    (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'general-p' }], meta: {} } },
    });

    const { result } = renderHook(() => useNearbyProvidersForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('city query failure cascades to the general directory', async () => {
    mockLocation({ source: 'city', city: 'رفح' });
    (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockImplementation((params?: { city?: string }) => {
      if (params?.city === 'رفح') return Promise.reject(new Error('city failed'));
      return Promise.resolve({ data: { data: { items: [{ id: 'general-p' }], meta: {} } } });
    });

    const { result } = renderHook(() => useNearbyProvidersForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('city query empty result cascades to the general directory', async () => {
    mockLocation({ source: 'city', city: 'رفح' });
    (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockImplementation((params?: { city?: string }) => {
      if (params?.city === 'رفح') return Promise.resolve({ data: { data: { items: [], meta: {} } } });
      return Promise.resolve({ data: { data: { items: [{ id: 'general-p' }], meta: {} } } });
    });

    const { result } = renderHook(() => useNearbyProvidersForHome(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    expect(result.current.data?.items).toHaveLength(1);
  });
});
