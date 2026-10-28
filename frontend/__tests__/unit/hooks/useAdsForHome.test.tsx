/**
 * useAdsForHome — prefers GET /home adsForHome seed; falls back to useAds.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAdsForHome } from '@/hooks/queries/useAdsForHome';

vi.mock('@/hooks/queries/useHomepage', () => ({
  useHomepage: vi.fn(),
}));
vi.mock('@/hooks/useBrowseCity', () => ({
  useBrowseCity: vi.fn(() => ({ city: null })),
}));
vi.mock('@/lib/useDataSaver', () => ({
  useDataSaver: vi.fn(() => false),
}));
vi.mock('@/hooks/queries/useAds', () => ({
  useAds: vi.fn(() => ({
    isLoading: false,
    isError: false,
    error: null,
    data: { items: [] },
    refetch: vi.fn(),
  })),
}));

import { useHomepage } from '@/hooks/queries/useHomepage';
import { useBrowseCity } from '@/hooks/useBrowseCity';
import { useAds } from '@/hooks/queries/useAds';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useAdsForHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useBrowseCity as ReturnType<typeof vi.fn>).mockReturnValue({ city: null });
    (useAds as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      data: { items: [] },
      refetch: vi.fn(),
    });
  });

  it('returns seeded adsForHome from homepage when present', () => {
    (useHomepage as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        adsForHome: {
          source: 'city',
          items: [{ id: 'a1', title: 'إعلان' }],
        },
        featuredCarousel: { ads: { items: [] } },
      },
      isPending: false,
      isSuccess: true,
      isError: false,
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAdsForHome(), { wrapper: createWrapper() });
    expect(result.current.source).toBe('city');
    expect(result.current.items.kind).toBe('ads');
    expect(result.current.items.data).toHaveLength(1);
    expect(result.current.isLoading).toBe(false);
  });

  it('falls back to useAds with source general when homepage has no seed', async () => {
    (useHomepage as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { adsForHome: null, featuredCarousel: { ads: { items: [] } } },
      isPending: false,
      isSuccess: true,
      isError: false,
      refetch: vi.fn(),
    });
    (useAds as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      data: { items: [{ id: 'x1' }] },
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAdsForHome(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.source).toBe('general'));
    expect(result.current.items.data).toHaveLength(1);
  });

  it('uses city source when browse city is set and no seed', async () => {
    (useBrowseCity as ReturnType<typeof vi.fn>).mockReturnValue({ city: 'غزة' });
    (useHomepage as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { adsForHome: null },
      isPending: false,
      isSuccess: true,
      isError: false,
      refetch: vi.fn(),
    });
    (useAds as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoading: false,
      isError: false,
      error: null,
      data: { items: [] },
      refetch: vi.fn(),
    });

    const { result } = renderHook(() => useAdsForHome(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.source).toBe('city'));
  });
});
