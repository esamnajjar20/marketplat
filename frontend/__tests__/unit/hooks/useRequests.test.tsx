import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useRequestDetail } from '@/hooks/queries/useRequests';
import { queryKeys } from '@/lib/queryKeys';
import type { RequestDetail } from '@/types/request.types';
import { requestsApi } from '@/api/requests.api';

vi.mock('@/api/requests.api', () => ({
  requestsApi: {
    getById: vi.fn(),
    getOpenFeed: vi.fn(),
    getMyRequests: vi.fn(),
    getMyOffers: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const publicRequest = {
  id: 'request-1',
  title: 'مطلوب هاتف',
  offers: [],
  customerId: 'owner-1',
} as RequestDetail;

describe('useRequestDetail SSR hydration', () => {
  it('uses the fresh hydrated public request without issuing a second GET for guests', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.requests.detail('request-1'), publicRequest);

    const { result } = renderHook(
      () => useRequestDetail('request-1', { staleTime: 120_000 }),
      { wrapper: makeWrapper(client) },
    );

    expect(result.current.data).toEqual(publicRequest);
    expect(requestsApi.getById).not.toHaveBeenCalled();
    client.clear();
  });

  it('falls back to a browser GET when the server did not hydrate the request', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(requestsApi.getById).mockResolvedValue({
      data: { data: publicRequest },
    } as never);

    const { result } = renderHook(
      () => useRequestDetail('request-1', { staleTime: 120_000 }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestsApi.getById).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it('refreshes hydrated public data when the viewer is authenticated', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const privateView = {
      ...publicRequest,
      offers: [{ id: 'offer-1', offererUserId: 'viewer-1', price: '10' }],
    };
    client.setQueryData(queryKeys.requests.detail('request-1'), publicRequest);
    vi.mocked(requestsApi.getById).mockResolvedValue({
      data: { data: privateView },
    } as never);

    const { result } = renderHook(
      () => useRequestDetail('request-1', { enabled: true, staleTime: 0 }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.data?.offers).toHaveLength(1));
    expect(requestsApi.getById).toHaveBeenCalledTimes(1);
    client.clear();
  });

  it('retains the anonymous-safe SSR data when an authenticated refresh fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(queryKeys.requests.detail('request-1'), publicRequest);
    vi.mocked(requestsApi.getById).mockRejectedValue(new Error('temporary auth/network failure'));

    const { result } = renderHook(
      () => useRequestDetail('request-1', { enabled: true, staleTime: 0 }),
      { wrapper: makeWrapper(client) },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toEqual(publicRequest);
    client.clear();
  });
});
