/**
 * __tests__/unit/hooks/useStores.test.tsx
 *
 * Previously uncovered (0%). Mirrors useFavorites.test.tsx's approach
 * for the shared-cache-Set side effect.
 *
 *  useStores / useStore: public list/detail, detail gated on a
 *   non-empty id.
 *  useMyStore: auth-gated, no retry (404 = "no store yet").
 *  useMyFollowedStores:
 *   - auth-gated
 *   - merges each page's storeId into the shared followedIds() Set
 *     after the query settles (not just page 1 — FIX BUG-03)
 *  getFollowedStoreIdsSnapshot: reads the cached Set, defaults to empty.
 *  useIsFollowingStore:
 *   - returns false before any data has loaded
 *   - returns true once the shared Set contains the storeId
 *   - reacts to the shared cache being updated elsewhere
 *   - returns false for a logged-out user even with a stale Set
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
  getFollowedStoreIdsSnapshot,
  useIsFollowingStore,
} from '@/hooks/queries/useStores';
import { storesApi } from '@/api/stores.api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api/stores.api', () => ({
  storesApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    getMyStore: vi.fn(),
    getMyFollowedStores: vi.fn(),
  },
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
    expect(storesApi.getById).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data with a non-empty id', async () => {
    (storesApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 's1', name: 'Store A' } },
    });

    const { result } = renderHook(() => useStore('s1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(storesApi.getById).toHaveBeenCalledWith('s1');
    expect(result.current.data).toEqual({ id: 's1', name: 'Store A' });
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
    const queryClient = makeSharedClient();
    renderHook(() => useMyFollowedStores(), { wrapper: wrapperFor(queryClient) });
    expect(storesApi.getMyFollowedStores).not.toHaveBeenCalled();
  });

  it('merges storeIds from the fetched page into the shared followedIds() Set', async () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (storesApi.getMyFollowedStores as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ storeId: 'store-1' }, { storeId: 'store-2' }], meta: {} } },
    });
    const queryClient = makeSharedClient();

    renderHook(() => useMyFollowedStores(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => {
      const ids = queryClient.getQueryData(queryKeys.stores.followedIds());
      expect(ids).toBeInstanceOf(Set);
    });

    const ids = queryClient.getQueryData<Set<string>>(queryKeys.stores.followedIds());
    expect(ids!.has('store-1')).toBe(true);
    expect(ids!.has('store-2')).toBe(true);
  });

  it('merges ids from a page other than page 1 into the shared Set (mirrors FIX BUG-03)', async () => {
    useAuthStore.getState().setAuth(mockUser, mockTokens);
    (storesApi.getMyFollowedStores as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ storeId: 'store-99' }], meta: {} } },
    });
    const queryClient = makeSharedClient();

    const { result } = renderHook(() => useMyFollowedStores({ page: 2 }), {
      wrapper: wrapperFor(queryClient),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const ids = queryClient.getQueryData<Set<string>>(queryKeys.stores.followedIds());
    expect(ids!.has('store-99')).toBe(true);
  });
});

describe('getFollowedStoreIdsSnapshot', () => {
  it('returns an empty Set when nothing has been cached yet', () => {
    const queryClient = makeSharedClient();
    expect(getFollowedStoreIdsSnapshot(queryClient)).toEqual(new Set());
  });

  it('returns the cached Set when one exists', () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.stores.followedIds(), new Set(['store-7']));
    expect(getFollowedStoreIdsSnapshot(queryClient)).toEqual(new Set(['store-7']));
  });
});

describe('useIsFollowingStore', () => {
  beforeEach(() => {
    // useIsFollowingStore internally calls useMyFollowedStores({ limit: 100 }),
    // so a default resolved mock avoids unhandled promise noise in tests
    // that don't care about that fetch.
    (storesApi.getMyFollowedStores as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [], meta: {} } },
    });
  });

  it('returns false before any data has loaded', () => {
    const queryClient = makeSharedClient();
    const { result } = renderHook(() => useIsFollowingStore('store-1'), {
      wrapper: wrapperFor(queryClient),
    });
    expect(result.current).toBe(false);
  });

  it('returns true once the shared Set contains the storeId', () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.stores.followedIds(), new Set(['store-1']));
    useAuthStore.getState().setAuth(mockUser, mockTokens);

    const { result } = renderHook(() => useIsFollowingStore('store-1'), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current).toBe(true);
  });

  it('reacts when the shared cache is updated elsewhere', async () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.stores.followedIds(), new Set<string>());
    useAuthStore.getState().setAuth(mockUser, mockTokens);

    const { result } = renderHook(() => useIsFollowingStore('store-5'), {
      wrapper: wrapperFor(queryClient),
    });
    expect(result.current).toBe(false);

    act(() => {
      queryClient.setQueryData<Set<string>>(queryKeys.stores.followedIds(), (old) =>
        new Set([...(old ?? []), 'store-5']),
      );
    });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false for a logged-out user even if a populated Set exists', () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.stores.followedIds(), new Set(['store-1']));

    const { result } = renderHook(() => useIsFollowingStore('store-1'), {
      wrapper: wrapperFor(queryClient),
    });

    expect(result.current).toBe(false);
  });
});
