/**
 * AuthHydrationProvider unit tests — updated for:
 *  - refreshSessionShared() instead of direct authApi.refresh()
 *  - usersApi.getBootstrap() instead of usersApi.getMe()
 *  - favorites deferred (not blocking restore)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthHydrationProvider } from '@/providers/AuthHydrationProvider';
import { useAuthStore } from '@/store/auth.store';
import { deleteCookie } from '@/lib/cookies';
import { clearPendingServerLogout, markPendingServerLogout } from '@/lib/pendingServerLogout';

const refreshSessionShared = vi.fn();
const getBootstrap = vi.fn();
const completePendingWithin = vi.fn();
const completePending = vi.fn();

// FIX WEB-PENDING-LOGOUT-01: marker storage stays real (localStorage); only the
// network-bound completion is replaced so each outcome can be driven directly.
vi.mock('@/lib/pendingServerLogout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pendingServerLogout')>();
  return {
    ...actual,
    completePendingServerLogoutWithin: (...args: unknown[]) => completePendingWithin(...args),
    completePendingServerLogout: (...args: unknown[]) => completePending(...args),
  };
});

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>();
  return {
    ...actual,
    // Mirror the real shared-refresh contract: it updates the auth store and
    // session-hint cookies before returning the response. Keeping this in the
    // mock prevents provider tests from accidentally exercising an impossible
    // state where refresh succeeds but no access token is installed.
    refreshSessionShared: async (...args: unknown[]) => {
      const response = await refreshSessionShared(...args);
      const tokens = response?.data?.data?.tokens;
      if (tokens?.accessToken) {
        useAuthStore.getState().setAccessToken(tokens.accessToken);
        useAuthStore.getState().setCsrfToken(response.data.data.csrfToken ?? null);
        document.cookie = `app_access_token=${tokens.accessToken}; path=/`;
        document.cookie = 'app_has_session=1; path=/';
      }
      return response;
    },
    isSessionRevoked: () => false,
  };
});

vi.mock('@/api/users.api', () => ({
  usersApi: {
    getBootstrap: (...args: unknown[]) => getBootstrap(...args),
    getMe: vi.fn(),
  },
}));

vi.mock('@/api/favorites.api', () => ({
  favoritesApi: { getAll: vi.fn().mockResolvedValue({ data: { data: { items: [] } } }) },
}));

vi.mock('@/lib/offlineSelfWarm', () => ({
  warmSelfDataForOffline: vi.fn(),
}));

vi.mock('@/lib/networkPolicy', () => ({
  getNetworkPolicy: () => ({ allowPrefetch: false }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('@/lib/authSessionBroadcast', () => ({
  subscribeToSessionEnded: () => () => {},
}));

const mockUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'USER' as const,
  city: 'غزة',
  avatarUrl: null,
  phone: null,
  bio: null,
  isActive: true,
  emailVerified: true,
  notificationPreferences: {
    newMessage: true,
    adViews: false,
    favAdUpdated: true,
    promotions: false,
  },
  createdAt: '',
  updatedAt: '',
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

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function bootstrapPayload(user = mockUser) {
  return {
    data: {
      data: {
        me: user,
        notificationsUnread: 0,
        conversationsUnread: 0,
        notifications: null,
        sellerProfile: null,
        store: null,
        serviceProvider: null,
        sellerAttention: null,
      },
    },
  };
}

describe('AuthHydrationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteCookie('app_access_token');
    deleteCookie('app_user_role');
    deleteCookie('app_has_session');
    deleteCookie('app_session_hint');
    // AUTH-ANON-REFRESH-01: the restore flow only runs when a session signal exists.
    // The backend's app_has_session is httpOnly, so the browser only ever sees the
    // middleware-mirrored app_session_hint. Most tests below exercise that flow.
    document.cookie = 'app_session_hint=1; path=/';
    clearPendingServerLogout();
    completePendingWithin.mockResolvedValue('retry-later');
    completePending.mockResolvedValue('retry-later');
  });

  afterEach(() => {
    cleanup();
    clearPendingServerLogout();
  });

  it('AUTH-ANON-REFRESH-01: anonymous visitor (no hint, no token, no user) skips /auth/refresh', async () => {
    deleteCookie('app_has_session');
    deleteCookie('app_session_hint');
    resetStoreToHydrated();
    useAuthStore.setState({ user: null });
    renderWithClient(
      <AuthHydrationProvider>
        <div />
      </AuthHydrationProvider>,
    );
    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));
    expect(refreshSessionShared).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('shows a visible route skeleton, not a blank viewport, while auth persistence hydrates', () => {
    useAuthStore.setState({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      isHydrated: false,
      isAuthResolving: true,
    });
    refreshSessionShared.mockReturnValue(new Promise(() => {}));

    const { getByRole } = renderWithClient(
      <AuthHydrationProvider>
        <div>App content</div>
      </AuthHydrationProvider>,
    );

    expect(getByRole('status')).toBeTruthy();
  });

  it('renders children immediately without blocking', () => {
    resetStoreToHydrated();
    refreshSessionShared.mockReturnValue(new Promise(() => {}));
    const { getByText } = renderWithClient(
      <AuthHydrationProvider>
        <div>App content</div>
      </AuthHydrationProvider>,
    );
    expect(getByText('App content')).toBeTruthy();
  });

  it('PROD-FIX-15: calls refreshSessionShared on mount when a session hint exists', async () => {
    resetStoreToHydrated();
    refreshSessionShared.mockRejectedValue({ response: { status: 401 } });
    renderWithClient(
      <AuthHydrationProvider>
        <div />
      </AuthHydrationProvider>,
    );
    await waitFor(() => {
      expect(refreshSessionShared).toHaveBeenCalledTimes(1);
    });
  });

  it('PROD-FIX-15: a 401 from refresh logs out cleanly and clears stale cookies', async () => {
    resetStoreToHydrated();
    document.cookie = 'app_access_token=stale-value';
    refreshSessionShared.mockRejectedValue({ response: { status: 401 } });
    renderWithClient(
      <AuthHydrationProvider>
        <div />
      </AuthHydrationProvider>,
    );
    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(document.cookie).not.toContain('app_access_token=stale-value');
    expect(getBootstrap).not.toHaveBeenCalled();
  });

  it('on a valid session: refreshes, bootstraps profile, resolves isAuthResolving', async () => {
    resetStoreToHydrated();
    refreshSessionShared.mockResolvedValue({
      data: { data: { tokens: { accessToken: 'new-access', expiresIn: '15m' }, csrfToken: 'csrf-abc' } },
    });
    getBootstrap.mockResolvedValue(bootstrapPayload());
    renderWithClient(
      <AuthHydrationProvider>
        <div />
      </AuthHydrationProvider>,
    );
    await waitFor(() => {
      expect(useAuthStore.getState().isAuthResolving).toBe(false);
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.city).toBe('غزة');
  });

  it('sets app_user_role cookie on success', async () => {
    resetStoreToHydrated();
    refreshSessionShared.mockResolvedValue({
      data: { data: { tokens: { accessToken: 'new-access', expiresIn: '15m' }, csrfToken: 'csrf-abc' } },
    });
    getBootstrap.mockResolvedValue(bootstrapPayload());
    renderWithClient(
      <AuthHydrationProvider>
        <div />
      </AuthHydrationProvider>,
    );
    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));
    expect(document.cookie).toContain('app_user_role=USER');
  });

  it('REGRESSION: isAuthResolving stays true while refresh is in flight', async () => {
    resetStoreToHydrated();
    let resolveRefresh!: (v: unknown) => void;
    refreshSessionShared.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    renderWithClient(
      <AuthHydrationProvider>
        <div />
      </AuthHydrationProvider>,
    );
    expect(useAuthStore.getState().isAuthResolving).toBe(true);
    resolveRefresh({
      data: { data: { tokens: { accessToken: 'new-access', expiresIn: '15m' }, csrfToken: 'csrf' } },
    });
    getBootstrap.mockResolvedValue(bootstrapPayload());
    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));
  });

  it('on bootstrap failure after successful refresh with 401: logs out cleanly', async () => {
    resetStoreToHydrated();
    refreshSessionShared.mockResolvedValue({
      data: { data: { tokens: { accessToken: 'new-access', expiresIn: '15m' }, csrfToken: 'csrf-abc' } },
    });
    getBootstrap.mockRejectedValue({ response: { status: 401 } });
    renderWithClient(
      <AuthHydrationProvider>
        <div />
      </AuthHydrationProvider>,
    );
    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('REGRESSION offline: network error on bootstrap after refresh keeps session token', async () => {
    resetStoreToHydrated();
    refreshSessionShared.mockImplementation(async () => {
      useAuthStore.getState().setAccessToken('kept-access');
      return {
        data: { data: { tokens: { accessToken: 'kept-access', expiresIn: '15m' }, csrfToken: 'csrf' } },
      };
    });
    getBootstrap.mockRejectedValue(new Error('Network Error'));
    renderWithClient(
      <AuthHydrationProvider>
        <div />
      </AuthHydrationProvider>,
    );
    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));
    expect(useAuthStore.getState().accessToken).toBe('kept-access');
  });

  it('REGRESSION offline: network error on initial refresh leaves store untouched', async () => {
    resetStoreToHydrated();
    useAuthStore.setState({
      user: mockUser as any,
      accessToken: 'old-token',
      isAuthenticated: true,
      isHydrated: true,
      isAuthResolving: true,
    });
    refreshSessionShared.mockRejectedValue(new Error('Network Error'));
    renderWithClient(
      <AuthHydrationProvider>
        <div />
      </AuthHydrationProvider>,
    );
    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));
    expect(useAuthStore.getState().accessToken).toBe('old-token');
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('only runs the restore flow once even if re-rendered', async () => {
    resetStoreToHydrated();
    refreshSessionShared.mockResolvedValue({
      data: { data: { tokens: { accessToken: 'new-access', expiresIn: '15m' }, csrfToken: 'csrf-abc' } },
    });
    getBootstrap.mockResolvedValue(bootstrapPayload());
    const { rerender } = renderWithClient(
      <AuthHydrationProvider>
        <div />
      </AuthHydrationProvider>,
    );
    await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <AuthHydrationProvider>
          <div>updated</div>
        </AuthHydrationProvider>
      </QueryClientProvider>,
    );
    expect(refreshSessionShared).toHaveBeenCalledTimes(1);
  });
  // FIX WEB-PENDING-LOGOUT-01 ─────────────────────────────────────────────
  describe('pending server logout (a logout the server never confirmed)', () => {
    const validRefresh = {
      data: { data: { tokens: { accessToken: 'new-access', expiresIn: '15m' }, csrfToken: 'csrf-abc' } },
    };

    it.each([['retry-later'], ['completed'], ['already-ended'], ['busy'], ['gave-up']])(
      'outcome "%s": stays signed out and never restores from the cookie',
      async (outcome) => {
        markPendingServerLogout('one', 'sess-A');
        completePendingWithin.mockResolvedValue(outcome);
        refreshSessionShared.mockResolvedValue(validRefresh);
        resetStoreToHydrated();

        renderWithClient(
          <AuthHydrationProvider>
            <div />
          </AuthHydrationProvider>,
        );
        await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));

        expect(completePendingWithin).toHaveBeenCalledTimes(1);
        expect(refreshSessionShared).not.toHaveBeenCalled();
        expect(getBootstrap).not.toHaveBeenCalled();
        expect(useAuthStore.getState().isAuthenticated).toBe(false);
      },
    );

    it('runs the pending branch even with no JS-readable session hint at all (anonymous skip must not apply)', async () => {
      deleteCookie('app_session_hint');
      markPendingServerLogout('one', null);
      completePendingWithin.mockResolvedValue('completed');
      resetStoreToHydrated();
      useAuthStore.setState({ user: null });

      renderWithClient(
        <AuthHydrationProvider>
          <div />
        </AuthHydrationProvider>,
      );
      await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));

      expect(completePendingWithin).toHaveBeenCalledTimes(1);
      expect(refreshSessionShared).not.toHaveBeenCalled();
    });

    it('outcome "superseded": a newer login owns the cookie, so the normal restore proceeds', async () => {
      markPendingServerLogout('one', 'sess-OLD');
      completePendingWithin.mockResolvedValue('superseded');
      refreshSessionShared.mockResolvedValue(validRefresh);
      getBootstrap.mockResolvedValue(bootstrapPayload());
      resetStoreToHydrated();

      renderWithClient(
        <AuthHydrationProvider>
          <div />
        </AuthHydrationProvider>,
      );
      await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));

      expect(refreshSessionShared).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('outcome "none": the marker vanished (another tab finished it), so the normal restore proceeds', async () => {
      markPendingServerLogout('one', 'sess-A');
      completePendingWithin.mockResolvedValue('none');
      refreshSessionShared.mockRejectedValue({ response: { status: 401 } });
      resetStoreToHydrated();

      renderWithClient(
        <AuthHydrationProvider>
          <div />
        </AuthHydrationProvider>,
      );
      await waitFor(() => expect(refreshSessionShared).toHaveBeenCalledTimes(1));
    });

    it('without a marker, the pending-logout completion is never invoked', async () => {
      refreshSessionShared.mockRejectedValue({ response: { status: 401 } });
      resetStoreToHydrated();

      renderWithClient(
        <AuthHydrationProvider>
          <div />
        </AuthHydrationProvider>,
      );
      await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));

      expect(completePendingWithin).not.toHaveBeenCalled();
    });

    it('retries the owed logout when connectivity returns while signed out', async () => {
      markPendingServerLogout('one', 'sess-A');
      completePendingWithin.mockResolvedValue('retry-later');
      resetStoreToHydrated();
      renderWithClient(
        <AuthHydrationProvider>
          <div />
        </AuthHydrationProvider>,
      );
      await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));
      completePending.mockClear();

      window.dispatchEvent(new Event('online'));

      expect(completePending).toHaveBeenCalledTimes(1);
    });

    it('does not retry on "online" when nothing is owed', async () => {
      resetStoreToHydrated();
      refreshSessionShared.mockRejectedValue({ response: { status: 401 } });
      renderWithClient(
        <AuthHydrationProvider>
          <div />
        </AuthHydrationProvider>,
      );
      await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));

      window.dispatchEvent(new Event('online'));

      expect(completePending).not.toHaveBeenCalled();
    });

    it('does not retry on "online" while a session is active', async () => {
      markPendingServerLogout('one', 'sess-A');
      completePendingWithin.mockResolvedValue('retry-later');
      resetStoreToHydrated();
      renderWithClient(
        <AuthHydrationProvider>
          <div />
        </AuthHydrationProvider>,
      );
      await waitFor(() => expect(useAuthStore.getState().isAuthResolving).toBe(false));
      useAuthStore.setState({ isAuthenticated: true });
      completePending.mockClear();

      window.dispatchEvent(new Event('online'));

      expect(completePending).not.toHaveBeenCalled();
    });
  });
});
