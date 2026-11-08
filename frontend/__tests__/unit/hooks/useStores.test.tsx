/**
 * __tests__/unit/hooks/useStores.test.tsx
 *
 * Covers public store queries, authenticated owner data, and follow-status
 * behavior without requiring a full followed-stores download for store detail.
 *
 *  useStores / useStore: public list/detail, detail gated on a
 *   non-empty id.
 *  useMyStore: auth-gated, no retry (404 = "no store yet").
 *  useMyFollowedStores: auth-gated paginated list query.
 *  useIsFollowingStore:
 *   - checks one STORE target through GET /follows/status/STORE/:id
 *   - never downloads the full followed-stores list for a detail page
 *   - returns false for a logged-out user even if stale status is cached
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useStores,
  useStore,
  useMyStore,
  useMyFollowedStores,
  useIsFollowingStore,
} from '@/hooks/queries/useStores';
import { storesApi } from '@/api/stores.api';
import { followsApi } from '@/api/follows.api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/auth.store';
import { saveVisitedPublicStore } from '@/lib/offlineVisitedPublicEntities';

vi.mock('@/api/stores.api', () => ({
  storesApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getPageData: vi.fn(),
    getMyStore: vi.fn(),
    getMyFollowedStores: vi.fn(),
  },
}));

vi.mock('@/api/follows.api', () => ({
  followsApi: { status: vi.fn() },
}));

vi.mock('@/lib/offlineVisitedPublicEntities', () => ({
  clearVisitedPublicStore: vi.fn(),
  getVisitedPublicStore: vi.fn(),
  saveVisitedPublicStore: vi.fn(),
}));

const mockUser = { id: 'user-1', name: 'Ahmed', email: 'ahmed@example.com', role: 'USER' as const };
const mockTokens = { accessToken: 'a' };

function makeSharedClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function createWrapper() {
  const queryClient = makeSharedClient();
  return wrapperFor(queryClient);
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().logout();
});

describe('useStores', () => {
  it('fires without auth and unwraps r.data.data', async () => {
    (storesApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 's1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useStores(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ items: [{ id: 's1' }], meta: { total: 1 } });
  });
});

describe('useStore', () => {
  it('does not fire with an empty id', async () => {
    renderHook(() => useStore(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(storesApi.getPageData).not.toHaveBeenCalled();
  });

  it('fires once and persists an active browser-fetched store for offline revisits', async () => {
    const store = { id: 's1', name: 'Store A', status: 'ACTIVE' };
    const pageData = { store, badges: [{ type: 'POPULAR' }], viewer: { isFollowing: true, isFavorited: false } };
    (storesApi.getPageData as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: pageData },
    });

    const { result } = renderHook(() => useStore('s1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(storesApi.getPageData).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.data).toEqual(pageData);
    await waitFor(() => expect(saveVisitedPublicStore).toHaveBeenCalledWith('s1', store));
  });

  it('does not re-save a stale offline store snapshot after a failed network read', async () => {
    const snapshot = { id: 's2', name: 'Store B', status: 'ACTIVE' };
    (storesApi.getPageData as ReturnType<typeof vi.fn>).mockRejectedValue({ statusCode: 0 });
    const { getVisitedPublicStore } = await import('@/lib/offlineVisitedPublicEntities');
    vi.mocked(getVisitedPublicStore).mockReturnValue(snapshot as never);

    const { result } = renderHook(() => useStore('s2'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data?.store).toEqual(snapshot));
    expect(saveVisitedPublicStore).not.toHaveBeenCalled();
  });

  it('scopes aggregate viewer flags to the signed-in account', async () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (storesApi.getPageData as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { store: { id: 's3', status: 'ACTIVE' }, badges: [], viewer: { isFollowing: true, isFavorited: false } } },
    });
    const queryClient = makeSharedClient();

    const { result, rerender } = renderHook(() => useStore('s3'), { wrapper: wrapperFor(queryClient) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryCache().findAll({ queryKey: queryKeys.stores.detail('s3') })).toHaveLength(1);

    useAuthStore.getState().setAuth({ ...mockUser, id: 'user-2' }, mockTokens);
    rerender();
    await waitFor(() => expect(storesApi.getPageData).toHaveBeenCalledTimes(2));
    expect(queryClient.getQueryCache().findAll({ queryKey: queryKeys.stores.detail('s3') })).toHaveLength(2);
  });
});

describe('useMyStore', () => {
  it('does not fire when not authenticated', async () => {
    renderHook(() => useMyStore(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(storesApi.getMyStore).not.toHaveBeenCalled();
  });

  it('fires once authenticated and does not retry on failure', async () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (storesApi.getMyStore as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not found'));

    const { result } = renderHook(() => useMyStore(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(storesApi.getMyStore).toHaveBeenCalledTimes(1);
  });
});

describe('useMyFollowedStores', () => {
  it('does not fetch when not authenticated', () => {
    renderHook(() => useMyFollowedStores({ limit: 100 }), { wrapper: createWrapper() });
    expect(storesApi.getMyFollowedStores).not.toHaveBeenCalled();
  });

  it('fetches the requested followed-store page when authenticated', async () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (storesApi.getMyFollowedStores as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ storeId: 'store-1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useMyFollowedStores({ page: 1, limit: 20 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(storesApi.getMyFollowedStores).toHaveBeenCalledWith(
      { page: 1, limit: 20 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.data?.items).toEqual([{ storeId: 'store-1' }]);
  });
});


describe('useIsFollowingStore', () => {
  it('returns false before the authenticated status request resolves', async () => {
    const queryClient = makeSharedClient();
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (followsApi.status as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useIsFollowingStore('store-1'), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current).toBe(false);
    await waitFor(() => expect(followsApi.status).toHaveBeenCalledWith(
      'STORE',
      'store-1',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    expect(storesApi.getMyFollowedStores).not.toHaveBeenCalled();
  });

  it('returns the single-store follow status returned by the API', async () => {
    const queryClient = makeSharedClient();
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (followsApi.status as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { following: true } },
    });

    const { result } = renderHook(() => useIsFollowingStore('store-1'), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current).toBe(true));
    expect(followsApi.status).toHaveBeenCalledTimes(1);
    expect(storesApi.getMyFollowedStores).not.toHaveBeenCalled();
  });

  it('reacts to a status value written by the store-follow mutation', async () => {
    const queryClient = makeSharedClient();
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    queryClient.setQueryData(queryKeys.follows.status('STORE', 'store-5'), false);

    const { result } = renderHook(() => useIsFollowingStore('store-5'), {
      wrapper: wrapperFor(queryClient),
    });
    expect(result.current).toBe(false);

    act(() => {
      queryClient.setQueryData(queryKeys.follows.status('STORE', 'store-5'), true);
    });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false for a logged-out user even if a status is cached', () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.follows.status('STORE', 'store-1'), true);

    const { result } = renderHook(() => useIsFollowingStore('store-1'), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current).toBe(false);
    expect(followsApi.status).not.toHaveBeenCalled();
  });
});
