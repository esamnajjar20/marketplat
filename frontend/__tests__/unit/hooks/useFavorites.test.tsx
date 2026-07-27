/**
 * Coverage targets:
 *
 *  useFavorites:
 *   - populates queryKeys.favorites.ids() with a Set<string> after a
 *     successful fetch (not an array — this is the type the rest of
 *     the favorites code depends on)
 *   - FIX TYPE-01: the Set must be built from each item's `.ad.id` —
 *     the backend returns Favorite records with the ad nested under
 *     `.ad`, not AdListItem[] directly. (This test file previously
 *     used bare AdListItem objects as the mocked `items`, which passed
 *     only because it shared the same wrong assumption the production
 *     code had — see makeFavoriteRecord below for the corrected shape.)
 *   - only populates the ids Set from page 1 (a first-page snapshot)
 *   - is disabled (no fetch) when the user isn't authenticated
 *
 *  useToggleFavorite (regression test for the Set/Array crash):
 *   - REGRESSION: toggling after the cache already holds a real Set
 *     (as it would after visiting any page using useFavorites) must
 *     not throw — this exact scenario crashed in production before the
 *     fix, since the optimistic updater called .includes()/.filter()
 *     on what was actually a Set, not an array.
 *   - adds an ad ID to the Set when toggling a not-yet-favorited ad
 *   - removes an ad ID from the Set when toggling an already-favorited ad
 *   - rolls back to the previous Set on a failed request
 *   - works correctly even when the cache has no prior favorites data
 *     at all (first-ever toggle in a session)
 *
 *  useIsFavorited:
 *   - returns false before any favorites data has loaded
 *   - returns true once the ids Set (populated by useFavorites)
 *     contains the given adId
 *   - reacts to a toggle elsewhere updating the shared cache, without
 *     needing to re-render via props (cache-subscription behavior)
 *   - returns false for a logged-out user even if a stale Set exists
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useFavorites, useIsFavorited, getFavoriteIdsSnapshot } from '@/hooks/queries/useFavorites';
import { useToggleFavorite } from '@/hooks/mutations/useFavoriteMutations';
import { favoritesApi } from '@/api/favorites.api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';

vi.mock('@/api/favorites.api', () => ({
  favoritesApi: {
    getAll: vi.fn(),
    toggle: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockUser = {
  id: 'user-1', name: 'Ahmed', email: 'ahmed@example.com', role: 'USER' as const,
};
// PROD-FIX-15: refreshToken removed — no longer part of AuthTokens.
const mockTokens = { accessToken: 'a' };

function makeAdListItem(id: string) {
  return { id, title: `Ad ${id}`, price: '100', images: [], status: 'ACTIVE', city: 'غزة', createdAt: new Date().toISOString() };
}

/**
 * FIX TYPE-01: matches the real backend shape — a Favorite row with the
 * ad nested under `.ad` (favorites.repository.ts's FavoriteWithAd via
 * Prisma.FavoriteGetPayload<{ include: { ad: {...} } }>), not the ad
 * itself. `id` here is the Favorite row's own id — deliberately
 * different from the ad's id, so a test that accidentally reads the
 * wrong field fails loudly instead of coincidentally passing.
 */
function makeFavoriteRecord(adId: string) {
  return {
    id: `fav-record-${adId}`,
    userId: 'user-1',
    adId,
    createdAt: new Date().toISOString(),
    ad: makeAdListItem(adId),
  };
}

/**
 * Unlike useUpdateProfile.test.tsx's createWrapper() (a fresh QueryClient
 * per render), the favorites tests need ONE shared QueryClient across
 * multiple renderHook() calls within a single test, since the whole
 * point is verifying that useFavorites' cache write and
 * useToggleFavorite's cache read/write operate on the same underlying
 * Set instance.
 */
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

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().setAuth(mockUser, mockTokens);
});

describe('useFavorites', () => {
  it('populates the favorites ids cache with a Set<string> after a successful fetch', async () => {
    (favoritesApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [makeFavoriteRecord('ad-1'), makeFavoriteRecord('ad-2')], meta: {} } },
    });
    const queryClient = makeSharedClient();

    renderHook(() => useFavorites(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => {
      const ids = queryClient.getQueryData(queryKeys.favorites.ids());
      expect(ids).toBeInstanceOf(Set);
    });

    const ids = queryClient.getQueryData<Set<string>>(queryKeys.favorites.ids());
    expect(ids!.has('ad-1')).toBe(true);
    expect(ids!.has('ad-2')).toBe(true);
  });

  // FIX TYPE-01 / BUG regression: the Set used to be built from each
  // item's own `.id` (the Favorite row's id), not `.ad.id` (the actual
  // ad's id). This test uses ids that are deliberately different in
  // shape from the ad id, so it fails loudly if the bug ever comes back.
  it('REGRESSION: builds the Set from each favorite record\'s nested ad.id, not the favorite record\'s own id', async () => {
    const record = makeFavoriteRecord('real-ad-id-123');
    expect(record.id).not.toBe(record.ad.id); // sanity: the two ids really differ

    (favoritesApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [record], meta: {} } },
    });
    const queryClient = makeSharedClient();

    renderHook(() => useFavorites(), { wrapper: wrapperFor(queryClient) });

    await waitFor(() => {
      const ids = queryClient.getQueryData<Set<string>>(queryKeys.favorites.ids());
      expect(ids).toBeDefined();
    });

    const ids = queryClient.getQueryData<Set<string>>(queryKeys.favorites.ids());
    expect(ids!.has(record.ad.id)).toBe(true);   // the real ad id — must be present
    expect(ids!.has(record.id)).toBe(false);     // the favorite row's own id — must NOT leak in
  });

  it('merges ids from a page other than page 1 into the shared Set (FIX H-BUG-01)', async () => {
    (favoritesApi.getAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [makeFavoriteRecord('ad-99')], meta: {} } },
    });
    const queryClient = makeSharedClient();

    const { result } = renderHook(() => useFavorites({ page: 2 }), { wrapper: wrapperFor(queryClient) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const ids = queryClient.getQueryData<Set<string>>(queryKeys.favorites.ids());
    expect(ids!.has('ad-99')).toBe(true);
  });

  it('does not fetch when the user is not authenticated', () => {
    useAuthStore.getState().logout();
    const queryClient = makeSharedClient();

    renderHook(() => useFavorites(), { wrapper: wrapperFor(queryClient) });

    expect(favoritesApi.getAll).not.toHaveBeenCalled();
  });
});

describe('useToggleFavorite', () => {
  it('REGRESSION: does not throw when toggling after the cache already holds a real Set (the original H-06 crash scenario)', async () => {
    const queryClient = makeSharedClient();
    // Reproduce exactly what useFavorites leaves in the cache after a
    // real fetch — a genuine Set instance, not an array.
    queryClient.setQueryData(queryKeys.favorites.ids(), new Set(['ad-1', 'ad-2']));
    (favoritesApi.toggle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { action: 'removed' } },
    });

    const { result } = renderHook(() => useToggleFavorite(), { wrapper: wrapperFor(queryClient) });

    // Before the fix, this threw synchronously inside onMutate
    // ("old.includes is not a function") because the cache held a Set
    // but the updater treated it as a string[].
    expect(() => act(() => { result.current.mutate('ad-1'); })).not.toThrow();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('adds the ad ID to the Set when toggling a not-yet-favorited ad', async () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.favorites.ids(), new Set(['ad-1']));
    (favoritesApi.toggle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { action: 'added' } },
    });

    const { result } = renderHook(() => useToggleFavorite(), { wrapper: wrapperFor(queryClient) });
    act(() => { result.current.mutate('ad-2'); });

    // Optimistic update should be synchronous/immediate, before the
    // mocked network call even resolves.
    const idsDuringFlight = queryClient.getQueryData<Set<string>>(queryKeys.favorites.ids());
    expect(idsDuringFlight!.has('ad-2')).toBe(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('removes the ad ID from the Set when toggling an already-favorited ad', async () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.favorites.ids(), new Set(['ad-1', 'ad-2']));
    (favoritesApi.toggle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { action: 'removed' } },
    });

    const { result } = renderHook(() => useToggleFavorite(), { wrapper: wrapperFor(queryClient) });
    act(() => { result.current.mutate('ad-1'); });

    const idsDuringFlight = queryClient.getQueryData<Set<string>>(queryKeys.favorites.ids());
    expect(idsDuringFlight!.has('ad-1')).toBe(false);
    expect(idsDuringFlight!.has('ad-2')).toBe(true); // untouched

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls back to the previous Set when the request fails', async () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.favorites.ids(), new Set(['ad-1']));
    (favoritesApi.toggle as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useToggleFavorite(), { wrapper: wrapperFor(queryClient) });
    act(() => { result.current.mutate('ad-2'); });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const idsAfterRollback = queryClient.getQueryData<Set<string>>(queryKeys.favorites.ids());
    expect(idsAfterRollback!.has('ad-2')).toBe(false);
    expect(idsAfterRollback!.has('ad-1')).toBe(true);
    expect(toast.error).toHaveBeenCalled();
  });

  it('does not throw when toggling with no prior favorites data in the cache at all', async () => {
    const queryClient = makeSharedClient();
    // No setQueryData call at all — simulates the very first favorite
    // toggle of a session, before useFavorites has ever populated anything.
    (favoritesApi.toggle as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { action: 'added' } },
    });

    const { result } = renderHook(() => useToggleFavorite(), { wrapper: wrapperFor(queryClient) });
    expect(() => act(() => { result.current.mutate('ad-1'); })).not.toThrow();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});

describe('useIsFavorited', () => {
  it('returns false before any favorites data has loaded', () => {
    const queryClient = makeSharedClient();
    const { result } = renderHook(() => useIsFavorited('ad-1'), { wrapper: wrapperFor(queryClient) });
    expect(result.current).toBe(false);
  });

  it('returns true once the ids Set contains the given adId', () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.favorites.ids(), new Set(['ad-1', 'ad-2']));

    const { result } = renderHook(() => useIsFavorited('ad-1'), { wrapper: wrapperFor(queryClient) });
    expect(result.current).toBe(true);
  });

  it('returns false for an adId not in the ids Set', () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.favorites.ids(), new Set(['ad-1']));

    const { result } = renderHook(() => useIsFavorited('ad-999'), { wrapper: wrapperFor(queryClient) });
    expect(result.current).toBe(false);
  });

  it('reacts when a toggle elsewhere updates the shared cache', async () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.favorites.ids(), new Set<string>());

    const { result } = renderHook(() => useIsFavorited('ad-5'), { wrapper: wrapperFor(queryClient) });
    expect(result.current).toBe(false);

    // Simulate what useToggleFavorite's optimistic update does, from
    // an entirely separate part of the app (e.g. a different AdCard).
    act(() => {
      queryClient.setQueryData<Set<string>>(queryKeys.favorites.ids(), (old) => new Set([...(old ?? []), 'ad-5']));
    });

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false for a logged-out user even if a populated Set exists in the cache', () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.favorites.ids(), new Set(['ad-1']));
    useAuthStore.getState().logout();

    const { result } = renderHook(() => useIsFavorited('ad-1'), { wrapper: wrapperFor(queryClient) });
    expect(result.current).toBe(false);
  });
});

describe('getFavoriteIdsSnapshot', () => {
  it('returns an empty Set when nothing has been cached yet', () => {
    const queryClient = makeSharedClient();
    expect(getFavoriteIdsSnapshot(queryClient)).toEqual(new Set());
  });

  it('returns the cached Set when one exists', () => {
    const queryClient = makeSharedClient();
    queryClient.setQueryData(queryKeys.favorites.ids(), new Set(['ad-7']));
    expect(getFavoriteIdsSnapshot(queryClient)).toEqual(new Set(['ad-7']));
  });
});
