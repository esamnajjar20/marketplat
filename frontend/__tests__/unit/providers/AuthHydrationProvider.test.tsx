/**
 * FIX TEST-V4-12: AuthHydrationProvider.tsx had zero test coverage
 * despite being the fix point for two real production bugs:
 *
 *  1. The false-logout race (FIX AUTH-04): isHydrated flipped true
 *     synchronously from localStorage while isAuthenticated stayed
 *     false until this component's async refresh resolved — a window
 *     where ProtectedLayout/AdminLayout couldn't tell "definitely
 *     logged out" from "still verifying a valid persisted session."
 *     setAuthResolved() (tested via isAuthResolving here) is the fix.
 *
 *  2. The dead AbortController (FIX AUTH-05): the 8s timeout existed
 *     but never actually cancelled the underlying axios calls, so a
 *     slow network could hang for up to ~30s instead of the documented
 *     ~8s. Tested here by confirming the AbortSignal is actually
 *     passed through to both authApi.refresh and usersApi.getMe.
 *
 * PROD-FIX-15: refreshToken moved from localStorage to an httpOnly
 * cookie the backend sets directly — this component can no longer
 * read it client-side to decide whether to attempt a restore, so it
 * now ALWAYS calls authApi.refresh() on mount and lets the response
 * (success = a valid cookie existed; 401 = it didn't) be the source of
 * truth. Every test below reflects that: there is no more
 * "no refresh token — skip entirely, refresh never called" case,
 * since that information genuinely isn't available client-side
 * anymore. What used to be that case is now "refresh() rejects almost
 * immediately with a 401" — same observable end state (logged out,
 * isAuthResolving settles to false), reached via one extra network
 * call instead of zero.
 *
 * No vi.resetModules() — same reasoning as client.test.ts and
 * useFavorites.test.tsx: auth.store.ts's useAuthStore has no
 * globalThis singleton protection, so resetting modules would
 * disconnect this test's references from what the component reads.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthHydrationProvider } from '@/providers/AuthHydrationProvider';
import { useAuthStore } from '@/store/auth.store';
import { authApi } from '@/api/auth.api';
import { usersApi } from '@/api/users.api';
import { deleteCookie } from '@/lib/cookies';

vi.mock('@/api/auth.api', () => ({
  authApi: { refresh: vi.fn() },
}));

vi.mock('@/api/users.api', () => ({
  usersApi: { getMe: vi.fn() },
}));

/**
 * AuthHydrationProvider calls useQueryClient() internally (to seed
 * queryKeys.auth.me() after a successful restore) — every render below
 * needs a real QueryClientProvider ancestor or that hook throws.
 */
function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockUser = {
  id: 'user-1', name: 'Ahmed', email: 'a@example.com', role: 'USER',
  avatarUrl: 'https://example.com/a.jpg', city: 'غزة',
  phone: null, bio: null, isActive: true,
  notificationPreferences: { newMessage: true, adViews: false, favAdUpdated: true, promotions: false },
  createdAt: '', updatedAt: '',
};

function resetStoreToHydrated() {
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isHydrated: true,
    isAuthResolving: true,
  });
}

describe('AuthHydrationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // BUGFIX (found during a post-implementation code audit):
    // `document.cookie = ''` does NOT clear existing cookies in jsdom
    // (or real browsers) — assigning to document.cookie only
    // sets/updates the ONE cookie described by that string; an empty
    // string does not describe a valid cookie and is effectively a
    // no-op. Cookies set by a previous test (e.g. 'sets both the
    // app_access_token and app_user_role cookies on success' below)
    // would silently leak into subsequent tests, undermining any test
    // that asserts a cookie is absent — deleteCookie() (lib/cookies.ts)
    // is the same helper the component itself uses, so it clears
    // cookies with matching attributes the same way a real logout would.
    deleteCookie('app_access_token');
    deleteCookie('app_user_role');
  });

  afterEach(() => {
    // BUGFIX: without this, a previous test's AuthHydrationProvider
    // instance stays mounted (React never unmounts it) with its async
    // refresh effect still in flight. That effect has no abort-on-
    // unmount cleanup, so it can resolve and call setAuthResolved()
    // during a LATER test — racing that test's own state assertions
    // against the shared useAuthStore singleton. Unmounting here is
    // what the missing effect cleanup (see AuthHydrationProvider.tsx)
    // would otherwise have prevented.
    cleanup();
  });

  it('renders children immediately without blocking (FIX PERF-01 — no spinner here)', () => {
    resetStoreToHydrated();
    (authApi.refresh as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {})); // never resolves
    const { getByText } = renderWithClient(
      <AuthHydrationProvider><div>App content</div></AuthHydrationProvider>,
    );
    expect(getByText('App content')).toBeTruthy();
  });

  it('PROD-FIX-15: always calls authApi.refresh() on mount — there is no client-readable token to check first', async () => {
    resetStoreToHydrated();
    (authApi.refresh as ReturnType<typeof vi.fn>).mockRejectedValue({ response: { status: 401 } });

    renderWithClient(<AuthHydrationProvider><div /></AuthHydrationProvider>);

    await waitFor(() => {
      expect(authApi.refresh).toHaveBeenCalledTimes(1);
    });
  });

  it('PROD-FIX-15: a 401 from refresh (no valid session cookie) logs out cleanly and clears stale cookies', async () => {
    resetStoreToHydrated();
    document.cookie = 'app_access_token=stale-value';
    (authApi.refresh as ReturnType<typeof vi.fn>).mockRejectedValue({ response: { status: 401 } });

    renderWithClient(<AuthHydrationProvider><div /></AuthHydrationProvider>);

    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(document.cookie).not.toContain('app_access_token=stale-value');
    expect(usersApi.getMe).not.toHaveBeenCalled();
  });

  it('on a valid session cookie: refreshes, fetches the profile, and resolves isAuthResolving to false', async () => {
    resetStoreToHydrated();
    (authApi.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { tokens: { accessToken: 'new-access' }, csrfToken: 'csrf-abc' } },
    });
    (usersApi.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: mockUser } });

    renderWithClient(<AuthHydrationProvider><div /></AuthHydrationProvider>);

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthResolving).toBe(false);
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('new-access');
    expect(useAuthStore.getState().user?.city).toBe('غزة');
  });

  it('sets both the app_access_token and app_user_role cookies on success', async () => {
    resetStoreToHydrated();
    (authApi.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { tokens: { accessToken: 'new-access' }, csrfToken: 'csrf-abc' } },
    });
    (usersApi.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: mockUser } });

    renderWithClient(<AuthHydrationProvider><div /></AuthHydrationProvider>);

    await waitFor(() => expect(document.cookie).toContain('app_access_token=new-access'));
    expect(document.cookie).toContain('app_user_role=USER');
  });

  it('REGRESSION (false-logout race): isAuthResolving stays true while the refresh is still in flight', async () => {
    resetStoreToHydrated();
    let resolveRefresh: (value: unknown) => void;
    (authApi.refresh as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => { resolveRefresh = resolve; }),
    );

    renderWithClient(<AuthHydrationProvider><div /></AuthHydrationProvider>);

    await waitFor(() => {
      expect(useAuthStore.getState().isHydrated).toBe(true);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
    expect(useAuthStore.getState().isAuthResolving).toBe(true);

    resolveRefresh!({ data: { data: { tokens: { accessToken: 'new-access' }, csrfToken: 'csrf-abc' } } });
    (usersApi.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: mockUser } });

    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));
  });

  it('on refresh failure (invalid/expired cookie): logs out, clears cookies, and resolves isAuthResolving to false', async () => {
    resetStoreToHydrated();
    (authApi.refresh as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('401'));

    renderWithClient(<AuthHydrationProvider><div /></AuthHydrationProvider>);

    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(usersApi.getMe).not.toHaveBeenCalled();
  });

  it('on /users/me failure (after a successful refresh): still logs out cleanly', async () => {
    resetStoreToHydrated();
    (authApi.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { tokens: { accessToken: 'new-access' }, csrfToken: 'csrf-abc' } },
    });
    (usersApi.getMe as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

    renderWithClient(<AuthHydrationProvider><div /></AuthHydrationProvider>);

    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('REGRESSION (dead AbortController): passes a real AbortSignal through to both authApi.refresh and usersApi.getMe', async () => {
    resetStoreToHydrated();
    (authApi.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { tokens: { accessToken: 'new-access' }, csrfToken: 'csrf-abc' } },
    });
    (usersApi.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: mockUser } });

    renderWithClient(<AuthHydrationProvider><div /></AuthHydrationProvider>);

    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));

    // PROD-FIX-15: refresh() now takes only a config argument (no more
    // refreshToken as the first positional argument) — the AbortSignal
    // is call[0], not call[1].
    const refreshCallArgs = (authApi.refresh as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(refreshCallArgs[0]?.signal).toBeInstanceOf(AbortSignal);

    const getMeCallArgs = (usersApi.getMe as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(getMeCallArgs[0]?.signal).toBeInstanceOf(AbortSignal);

    expect(getMeCallArgs[0].signal).toBe(refreshCallArgs[0].signal);
  });

  it('only runs the restore flow once, even if re-rendered with the same hydrated state', async () => {
    resetStoreToHydrated();
    (authApi.refresh as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { tokens: { accessToken: 'new-access' }, csrfToken: 'csrf-abc' } },
    });
    (usersApi.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: mockUser } });

    const { rerender } = renderWithClient(<AuthHydrationProvider><div /></AuthHydrationProvider>);
    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));

    rerender(<QueryClientProvider client={new QueryClient()}><AuthHydrationProvider><div>updated</div></AuthHydrationProvider></QueryClientProvider>);

    expect(authApi.refresh).toHaveBeenCalledTimes(1);
  });
});
