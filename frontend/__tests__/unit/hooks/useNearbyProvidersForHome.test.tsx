/** Contract tests for the homepage-seeded nearby service providers section. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useNearbyProvidersForHome } from '@/hooks/queries/useNearbyProvidersForHome';
import { useServiceProviders } from '@/hooks/queries/useServiceProviders';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { useDataSaver } from '@/lib/useDataSaver';

vi.mock('@/hooks/queries/useServiceProviders', () => ({ useServiceProviders: vi.fn() }));
vi.mock('@/hooks/useBrowseCity', () => ({ useBrowseCity: vi.fn() }));
vi.mock('@/hooks/queries/useHomepage', () => ({ useHomepage: vi.fn() }));
vi.mock('@/lib/useDataSaver', () => ({ useDataSaver: vi.fn() }));

const seeded = { items: [{ id: 'p1' }], source: 'city' };
const general = { items: [{ id: 'p2' }], meta: { total: 1 } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useDataSaver).mockReturnValue(false);
  vi.mocked(useBrowseCity).mockReturnValue({ city: undefined } as never);
  vi.mocked(useHomepage).mockReturnValue({ data: undefined, isPending: false, isError: false, isSuccess: false, refetch: vi.fn() } as never);
  vi.mocked(useServiceProviders).mockReturnValue({ data: general, isLoading: false, isError: false, refetch: vi.fn() } as never);
});

describe('useNearbyProvidersForHome', () => {
  it('uses the homepage seed without issuing a directory query', () => {
    vi.mocked(useHomepage).mockReturnValue({ data: { belowFold: { nearbyProviders: seeded } }, isPending: false, isError: false, isSuccess: true, refetch: vi.fn() } as never);
    const { result } = renderHook(() => useNearbyProvidersForHome());
    expect(result.current.data).toEqual(seeded);
    expect(result.current.source).toBe('city');
    expect(useServiceProviders).toHaveBeenCalledWith(expect.any(Object), { enabled: false });
  });

  it('fetches directory data after the homepage request fails', () => {
    vi.mocked(useHomepage).mockReturnValue({ data: undefined, isPending: false, isError: true, isSuccess: false, refetch: vi.fn() } as never);
    const { result } = renderHook(() => useNearbyProvidersForHome());
    expect(result.current.data).toEqual(general);
    expect(result.current.source).toBe('general');
    expect(useServiceProviders).toHaveBeenCalledWith(expect.objectContaining({ limit: expect.any(Number) }), { enabled: true });
  });

  it('fetches city-filtered directory data when a browse city is selected', () => {
    vi.mocked(useBrowseCity).mockReturnValue({ city: 'رفح' } as never);
    vi.mocked(useHomepage).mockReturnValue({ data: undefined, isPending: false, isError: true, isSuccess: false, refetch: vi.fn() } as never);
    const { result } = renderHook(() => useNearbyProvidersForHome());
    expect(result.current.source).toBe('city');
    expect(useServiceProviders).toHaveBeenCalledWith(expect.objectContaining({ city: 'رفح' }), { enabled: true });
  });

  it('does not report loading after a completed homepage request without a seed', () => {
    vi.mocked(useHomepage).mockReturnValue({ data: { belowFold: {} }, isPending: false, isError: false, isSuccess: true, refetch: vi.fn() } as never);
    vi.mocked(useServiceProviders).mockReturnValue({ data: general, isLoading: true, isError: false, refetch: vi.fn() } as never);
    const { result } = renderHook(() => useNearbyProvidersForHome());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toEqual(general);
  });
});
