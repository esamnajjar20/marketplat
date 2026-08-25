/**
 * __tests__/unit/hooks/useProductServiceStoreRecommendations.test.tsx
 *
 * PR4C: covers useProductRecommendations/useServiceRecommendations/
 * useStoreRecommendations — correct query key, correct params passed
 * to the API layer, the enabled/disabled gate on the product hook,
 * and that a missing coords value simply omits lat/lng. The existing
 * useRecommendations (ads) hook already has full coverage in
 * useSellersAndRecommendations.test.tsx and is untouched by this PR,
 * so it isn't re-tested here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useProductRecommendations,
  useServiceRecommendations,
  useStoreRecommendations,
} from '@/hooks/queries/useRecommendations';
import { recommendationsApi } from '@/api/recommendations.api';

vi.mock('@/api/recommendations.api', () => ({
  recommendationsApi: {
    getRecommendations: vi.fn(),
    getProductRecommendations: vi.fn(),
    getServiceRecommendations: vi.fn(),
    getStoreRecommendations: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useProductRecommendations', () => {
  it('does not fire when disabled', async () => {
    renderHook(
      () => useProductRecommendations({ limit: 8 }, { enabled: false }),
      { wrapper: createWrapper() }
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(recommendationsApi.getProductRecommendations).not.toHaveBeenCalled();
  });

  it('fires with the given params and unwraps r.data.data when enabled', async () => {
    (recommendationsApi.getProductRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 'prod-1' }] },
    });

    const { result } = renderHook(
      () => useProductRecommendations({ limit: 8, excludeProductId: 'prod-1' }, { enabled: true }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(recommendationsApi.getProductRecommendations).toHaveBeenCalledWith({
      limit: 8,
      excludeProductId: 'prod-1',
    });
    expect(result.current.data).toEqual([{ id: 'prod-1' }]);
  });

  it('defaults to enabled when no options object is passed', async () => {
    (recommendationsApi.getProductRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [] },
    });

    renderHook(() => useProductRecommendations({ limit: 4 }), { wrapper: createWrapper() });
    await waitFor(() => expect(recommendationsApi.getProductRecommendations).toHaveBeenCalled());
  });

  it('defaults to an empty array when the response has no data', async () => {
    (recommendationsApi.getProductRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: undefined },
    });

    const { result } = renderHook(
      () => useProductRecommendations({ limit: 4 }, { enabled: true }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe('useServiceRecommendations', () => {
  it('fires with excludeServiceListingId and unwraps the response', async () => {
    (recommendationsApi.getServiceRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 'svc-1' }] },
    });

    const { result } = renderHook(
      () => useServiceRecommendations({ limit: 8, excludeServiceListingId: 'svc-1' }),
      { wrapper: createWrapper() }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(recommendationsApi.getServiceRecommendations).toHaveBeenCalledWith({
      limit: 8,
      excludeServiceListingId: 'svc-1',
    });
    expect(result.current.data).toEqual([{ id: 'svc-1' }]);
  });
});

describe('useStoreRecommendations', () => {
  it('passes lat/lng through when provided', async () => {
    (recommendationsApi.getStoreRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [] },
    });

    renderHook(
      () =>
        useStoreRecommendations({ limit: 6, excludeStoreId: 'store-1', lat: 31.5, lng: 34.4 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() =>
      expect(recommendationsApi.getStoreRecommendations).toHaveBeenCalledWith({
        limit: 6,
        excludeStoreId: 'store-1',
        lat: 31.5,
        lng: 34.4,
      })
    );
  });

  it('omits lat/lng when coordinates are unavailable', async () => {
    (recommendationsApi.getStoreRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [] },
    });

    renderHook(() => useStoreRecommendations({ limit: 6, excludeStoreId: 'store-1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() =>
      expect(recommendationsApi.getStoreRecommendations).toHaveBeenCalledWith({
        limit: 6,
        excludeStoreId: 'store-1',
      })
    );
  });
});
