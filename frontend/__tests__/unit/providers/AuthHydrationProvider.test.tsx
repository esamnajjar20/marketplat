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

const refreshSessionShared = vi.fn();
const getBootstrap = vi.fn();

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
  });

  afterEach(() => {
    cleanup();
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

  it('PROD-FIX-15: always calls refreshSessionShared on mount', async () => {
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
});
