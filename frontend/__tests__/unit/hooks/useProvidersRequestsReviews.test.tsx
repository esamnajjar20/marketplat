/**
 * __tests__/unit/hooks/useProvidersRequestsReviews.test.tsx
 *
 * Previously uncovered (0%): useServiceProviders.ts, useServiceRequests.ts,
 * useServiceReviews.ts, useStoreReviews.ts.
 *
 *  useServiceProvider: gated on a non-empty id.
 *  useMyServiceProvider: auth-gated, no retry (404 = "not a provider yet").
 *  useNearbyServiceProviders: gated on params !== null.
 *  useServiceRequest: gated on isAuthenticated && a non-empty id.
 *  useMyServiceRequests / useIncomingServiceRequests: auth-gated.
 *  useServiceReviewsForSeller / useStoreReviews: gated on a non-empty id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useServiceProvider,
  useMyServiceProvider,
  useNearbyServiceProviders,
} from '@/hooks/queries/useServiceProviders';
import {
  useServiceRequest,
  useMyServiceRequests,
  useIncomingServiceRequests,
} from '@/hooks/queries/useServiceRequests';
import { useServiceReviewsForSeller } from '@/hooks/queries/useServiceReviews';
import { useStoreReviews } from '@/hooks/queries/useStoreReviews';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { serviceRequestsApi } from '@/api/service-requests.api';
import { serviceReviewsApi } from '@/api/service-reviews.api';
import { storesApi } from '@/api/stores.api';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api/service-providers.api', () => ({
  serviceProvidersApi: { getById: vi.fn(), getMyProvider: vi.fn(), getNearby: vi.fn() },
}));
vi.mock('@/api/service-requests.api', () => ({
  serviceRequestsApi: {
    getById: vi.fn(),
    getMineAsCustomer: vi.fn(),
    getIncomingAsProvider: vi.fn(),
  },
}));
vi.mock('@/api/service-reviews.api', () => ({
  serviceReviewsApi: { getForSeller: vi.fn() },
}));
vi.mock('@/api/stores.api', () => ({
  storesApi: { getReviews: vi.fn() },
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

function login() {
  useAuthStore.getState().setAuth(
    { id: 'u1', name: 'Ahmed', email: 'a@b.com', role: 'USER' },
    { accessToken: 'a' },
  );
}

describe('useServiceProvider', () => {
  it('does not fire with an empty id', async () => {
    renderHook(() => useServiceProvider(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(serviceProvidersApi.getById).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data with a non-empty id', async () => {
    (serviceProvidersApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'prov-1' } },
    });

    const { result } = renderHook(() => useServiceProvider('prov-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(serviceProvidersApi.getById).toHaveBeenCalledWith('prov-1');
    expect(result.current.data).toEqual({ id: 'prov-1' });
  });
});

describe('useMyServiceProvider', () => {
  it('does not fire when not authenticated', async () => {
    renderHook(() => useMyServiceProvider(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(serviceProvidersApi.getMyProvider).not.toHaveBeenCalled();
  });

  it('fires once authenticated and does not retry on failure', async () => {
    login();
    (serviceProvidersApi.getMyProvider as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useMyServiceProvider(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(serviceProvidersApi.getMyProvider).toHaveBeenCalledTimes(1);
  });
});

describe('useNearbyServiceProviders', () => {
  it('does not fire when params is null', async () => {
    renderHook(() => useNearbyServiceProviders(null), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(serviceProvidersApi.getNearby).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data when params is provided', async () => {
    (serviceProvidersApi.getNearby as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: [{ id: 'prov-1', distanceKm: 1.2 }] },
    });
    const params = { lat: 31.5, lng: 34.4 };

    const { result } = renderHook(() => useNearbyServiceProviders(params), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(serviceProvidersApi.getNearby).toHaveBeenCalledWith(params);
    expect(result.current.data).toEqual([{ id: 'prov-1', distanceKm: 1.2 }]);
  });
});

describe('useServiceRequest', () => {
  it('does not fire when not authenticated, even with a valid id', async () => {
    renderHook(() => useServiceRequest('req-1'), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(serviceRequestsApi.getById).not.toHaveBeenCalled();
  });

  it('does not fire when authenticated but the id is empty', async () => {
    login();
    renderHook(() => useServiceRequest(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(serviceRequestsApi.getById).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data when authenticated with a valid id', async () => {
    login();
    (serviceRequestsApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'req-1', status: 'PENDING' } },
    });

    const { result } = renderHook(() => useServiceRequest('req-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ id: 'req-1', status: 'PENDING' });
  });
});

describe('useMyServiceRequests', () => {
  it('does not fire when not authenticated', async () => {
    renderHook(() => useMyServiceRequests(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(serviceRequestsApi.getMineAsCustomer).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data once authenticated', async () => {
    login();
    (serviceRequestsApi.getMineAsCustomer as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'req-1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useMyServiceRequests(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ items: [{ id: 'req-1' }], meta: { total: 1 } });
  });
});

describe('useIncomingServiceRequests', () => {
  it('does not fire when not authenticated', async () => {
    renderHook(() => useIncomingServiceRequests(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(serviceRequestsApi.getIncomingAsProvider).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data once authenticated', async () => {
    login();
    (serviceRequestsApi.getIncomingAsProvider as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'req-2' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useIncomingServiceRequests(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ items: [{ id: 'req-2' }], meta: { total: 1 } });
  });
});

describe('useServiceReviewsForSeller', () => {
  it('does not fire with an empty sellerProfileId', async () => {
    renderHook(() => useServiceReviewsForSeller(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(serviceReviewsApi.getForSeller).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data with a non-empty sellerProfileId', async () => {
    (serviceReviewsApi.getForSeller as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'rev-1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useServiceReviewsForSeller('seller-1'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(serviceReviewsApi.getForSeller).toHaveBeenCalledWith('seller-1', undefined);
    expect(result.current.data).toEqual({ items: [{ id: 'rev-1' }], meta: { total: 1 } });
  });
});

describe('useStoreReviews', () => {
  it('does not fire with an empty storeId', async () => {
    renderHook(() => useStoreReviews(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(storesApi.getReviews).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data with a non-empty storeId', async () => {
    (storesApi.getReviews as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'rev-1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useStoreReviews('store-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(storesApi.getReviews).toHaveBeenCalledWith('store-1', undefined);
    expect(result.current.data).toEqual({ items: [{ id: 'rev-1' }], meta: { total: 1 } });
  });
});
