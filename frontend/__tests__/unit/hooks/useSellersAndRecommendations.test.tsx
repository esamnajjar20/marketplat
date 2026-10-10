/**
 * __tests__/unit/hooks/useSellersAndRecommendations.test.tsx
 *
 * Previously uncovered (0%): useRecommendations.ts, useSellers.ts,
 * useSellerRatings.ts.
 *
 *  useRecommendations: always enabled, defaults to [] with no data,
 *   supports the excludeAdId shape.
 *  useSellerProfile: gated on a non-empty id.
 *  useMySellerProfile: auth-gated, no retry (404 = "not a seller yet").
 *  useSellerRatings: gated on a non-empty sellerProfileId.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useRecommendations } from '@/hooks/queries/useRecommendations';
import { useSellerProfile, useMySellerProfile } from '@/hooks/queries/useSellers';
import { useSellerRatings } from '@/hooks/queries/useSellerRatings';
import { recommendationsApi } from '@/api/recommendations.api';
import { sellersApi } from '@/api/sellers.api';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api/recommendations.api', () => ({
  recommendationsApi: { getRecommendations: vi.fn() },
}));
vi.mock('@/api/sellers.api', () => ({
  sellersApi: { getById: vi.fn(), getMyProfile: vi.fn(), getRatings: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().logout();
});

describe('useRecommendations', () => {
  it('does not request recommendations while auth restoration is unresolved', async () => {
    useAuthStore.getState()._setAuthResolving(true);

    renderHook(() => useRecommendations(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(recommendationsApi.getRecommendations).not.toHaveBeenCalled();

    useAuthStore.getState().setAuthResolved();
    await waitFor(() => expect(recommendationsApi.getRecommendations).toHaveBeenCalledTimes(1));
  });
  it('fires without params and returns the unwrapped list', async () => {
    (recommendationsApi.getRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 'ad-1' }] },
    });

    const { result } = renderHook(() => useRecommendations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(recommendationsApi.getRecommendations).toHaveBeenCalledWith(undefined);
    expect(result.current.data).toEqual([{ id: 'ad-1' }]);
  });

  it('defaults to an empty array when the response has no data', async () => {
    (recommendationsApi.getRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: undefined },
    });

    const { result } = renderHook(() => useRecommendations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  it('passes an excludeAdId param through for the "related to this ad" mode', async () => {
    (recommendationsApi.getRecommendations as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [] },
    });

    const { result } = renderHook(() => useRecommendations({ excludeAdId: 'ad-1' }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(recommendationsApi.getRecommendations).toHaveBeenCalledWith({ excludeAdId: 'ad-1' });
  });
});

describe('useSellerProfile', () => {
  it('does not fire with an empty id', async () => {
    renderHook(() => useSellerProfile(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sellersApi.getById).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data with a non-empty id', async () => {
    (sellersApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'seller-1', name: 'Store A' } },
    });

    const { result } = renderHook(() => useSellerProfile('seller-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(sellersApi.getById).toHaveBeenCalledWith('seller-1');
    expect(result.current.data).toEqual({ id: 'seller-1', name: 'Store A' });
  });
});

describe('useMySellerProfile', () => {
  it('does not fire when not authenticated', async () => {
    renderHook(() => useMySellerProfile(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sellersApi.getMyProfile).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data once authenticated', async () => {
    useAuthStore.getState().setAuth(
      { id: 'u1', name: 'Ahmed', email: 'a@b.com', role: 'USER' },
      { accessToken: 'a' },
    );
    (sellersApi.getMyProfile as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'seller-1' } },
    });

    const { result } = renderHook(() => useMySellerProfile(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ id: 'seller-1' });
  });

  it('does not retry on failure (a 404 just means "not a seller yet")', async () => {
    useAuthStore.getState().setAuth(
      { id: 'u1', name: 'Ahmed', email: 'a@b.com', role: 'USER' },
      { accessToken: 'a' },
    );
    (sellersApi.getMyProfile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useMySellerProfile(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(sellersApi.getMyProfile).toHaveBeenCalledTimes(1);
  });
});

describe('useSellerRatings', () => {
  it('does not fire with an empty sellerProfileId', async () => {
    renderHook(() => useSellerRatings(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sellersApi.getRatings).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data with a non-empty sellerProfileId', async () => {
    (sellersApi.getRatings as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'rating-1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useSellerRatings('seller-1', { page: 1 }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(sellersApi.getRatings).toHaveBeenCalledWith('seller-1', { page: 1 });
    expect(result.current.data).toEqual({ items: [{ id: 'rating-1' }], meta: { total: 1 } });
  });
});
