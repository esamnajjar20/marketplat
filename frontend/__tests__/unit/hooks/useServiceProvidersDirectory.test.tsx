/**
 * __tests__/unit/hooks/useServiceProvidersDirectory.test.tsx
 *
 * Mirrors useNearbyProvidersForHome.test.tsx's cascade coverage
 * (same underlying cascade rules), plus the pagination behavior this
 * hook adds on top for the standalone /service-providers page:
 *  - gps-current/gps-saved → GET /service-providers/nearby
 *  - city → GET /service-providers?city=
 *  - fallback → GET /service-providers (no city)
 *  - nearby/city query failure or empty first page cascades to general
 *  - an empty page > 1 does NOT cascade away from a working source
 *  - page resets to 1 when the resolved source changes
 *  - setPage advances the page passed to the active query
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useServiceProvidersDirectory } from '@/hooks/useServiceProvidersDirectory';
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
  (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { items: [], meta: { totalPages: 1 } } } });
  (serviceProvidersApi.getNearby as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { items: [], meta: { totalPages: 1 } } } });
});

describe('useServiceProvidersDirectory', () => {
  it('gps-current: calls getNearby with lat/lng and page', async () => {
    mockLocation({ source: 'gps-current', latitude: 31.5, longitude: 34.45 });
    (serviceProvidersApi.getNearby as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'p1' }], meta: { totalPages: 1 } } },
    });

    const { result } = renderHook(() => useServiceProvidersDirectory(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('gps'));
    expect(serviceProvidersApi.getNearby).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 31.5, lng: 34.45, page: 1 }),
    );
  });

  it('city: calls getAll with city param and page', async () => {
    mockLocation({ source: 'city', city: 'خان يونس' });
    (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'p1' }], meta: { totalPages: 1 } } },
    });

    const { result } = renderHook(() => useServiceProvidersDirectory(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('city'));
    expect(serviceProvidersApi.getAll).toHaveBeenCalledWith(expect.objectContaining({ city: 'خان يونس', page: 1 }));
  });

  it('fallback: calls getAll with no city', async () => {
    mockLocation({ source: 'fallback' });
    (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'p1' }], meta: { totalPages: 1 } } },
    });

    const { result } = renderHook(() => useServiceProvidersDirectory(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    const cityCall = (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mock.calls.find(
      ([params]: [{ city?: string }]) => typeof params?.city === 'string',
    );
    expect(cityCall).toBeUndefined();
  });

  it('nearby query failure on page 1 cascades to the general directory', async () => {
    mockLocation({ source: 'gps-current', latitude: 1, longitude: 2 });
    (serviceProvidersApi.getNearby as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('nearby failed'));
    (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'general-p' }], meta: { totalPages: 1 } } },
    });

    const { result } = renderHook(() => useServiceProvidersDirectory(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('nearby query empty on page 1 cascades to the general directory', async () => {
    mockLocation({ source: 'gps-current', latitude: 1, longitude: 2 });
    (serviceProvidersApi.getNearby as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { items: [], meta: { totalPages: 1 } } } });
    (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'general-p' }], meta: { totalPages: 1 } } },
    });

    const { result } = renderHook(() => useServiceProvidersDirectory(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('city query failure on page 1 cascades to the general directory', async () => {
    mockLocation({ source: 'city', city: 'رفح' });
    (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockImplementation((params?: { city?: string }) => {
      if (params?.city === 'رفح') return Promise.reject(new Error('city failed'));
      return Promise.resolve({ data: { data: { items: [{ id: 'general-p' }], meta: { totalPages: 1 } } } });
    });

    const { result } = renderHook(() => useServiceProvidersDirectory(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.source).toBe('general'));
    expect(result.current.data?.items).toHaveLength(1);
  });

  it('advancing to page 2 on a working gps source does NOT cascade to general just because that page is empty', async () => {
    mockLocation({ source: 'gps-current', latitude: 1, longitude: 2 });
    (serviceProvidersApi.getNearby as ReturnType<typeof vi.fn>).mockImplementation((params?: { page?: number }) => {
      if (params?.page === 1) return Promise.resolve({ data: { data: { items: [{ id: 'p1' }], meta: { totalPages: 2 } } } });
      return Promise.resolve({ data: { data: { items: [], meta: { totalPages: 2 } } } });
    });

    const { result } = renderHook(() => useServiceProvidersDirectory(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.source).toBe('gps'));

    act(() => result.current.setPage?.((p) => p + 1));

    await waitFor(() => expect(result.current.page).toBe(2));
    // Still gps, not cascaded to general, even though page 2 is empty.
    expect(result.current.source).toBe('gps');
  });

  it('resets to page 1 when the resolved source changes', async () => {
    mockLocation({ source: 'fallback' });
    (serviceProvidersApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'g1' }], meta: { totalPages: 3 } } },
    });

    const { result, rerender } = renderHook(() => useServiceProvidersDirectory(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.source).toBe('general'));

    act(() => result.current.setPage?.((p) => p + 1));
    await waitFor(() => expect(result.current.page).toBe(2));

    // A GPS fix arrives mid-session.
    mockLocation({ source: 'gps-current', latitude: 1, longitude: 2 });
    (serviceProvidersApi.getNearby as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'p1' }], meta: { totalPages: 1 } } },
    });
    rerender();

    await waitFor(() => expect(result.current.source).toBe('gps'));
    expect(result.current.page).toBe(1);
  });
});
