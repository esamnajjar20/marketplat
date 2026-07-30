/**
 * Coverage targets:
 *
 *  useLogin:
 *   - calls authApi.login with the payload (redirectTo stripped out,
 *     never sent to the backend)
 *   - sets the auth store and both middleware cookies on success
 *   - REGRESSION (FIX AUTH-06): redirects to the provided redirectTo
 *     when present, not just the hardcoded dashboard
 *   - falls back to the dashboard when no redirectTo is given
 *   - enriches the user profile via a background /users/me call
 *   - on error: shows a toast, does not navigate
 *
 *  useRegister:
 *   - calls authApi.register, sets auth + cookies, redirects to dashboard
 *   - on error: shows a toast
 *
 *  useLogout / useLogoutAll:
 *   - REGRESSION: clears local session (store + cookies + query cache +
 *     redirect home) even when the server call itself fails — onSettled,
 *     not onSuccess, is what this hook intentionally uses
 *
 *  useRevokeSession:
 *   - invalidates the sessions query and shows a toast on success
 *   - shows an error toast on failure
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useLogin, useRegister, useLogout, useLogoutAll, useRevokeSession, useChangePassword,
} from '@/hooks/mutations/useAuthMutations';
import { authApi } from '@/api/auth.api';
import { usersApi } from '@/api/users.api';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/api/auth.api', () => ({
  authApi: {
    login: vi.fn(), register: vi.fn(), logout: vi.fn(), logoutAll: vi.fn(),
    revokeSession: vi.fn(), changePassword: vi.fn(),
  },
}));

vi.mock('@/api/users.api', () => ({
  usersApi: { getMe: vi.fn() },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockAuthResult = {
  user: { id: 'user-1', name: 'Ahmed', email: 'a@example.com', role: 'USER' },
  // PROD-FIX-15: refreshToken removed — the auth store no longer holds
  // one (see auth.store.ts / auth.types.ts's AuthTokens), it lives
  // exclusively in an httpOnly cookie the backend sets directly.
  tokens: { accessToken: 'access-1' },
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().logout();
  document.cookie = 'app_access_token=; max-age=0';
  document.cookie = 'app_user_role=; max-age=0';
  (usersApi.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { data: { id: 'user-1', name: 'Ahmed', email: 'a@example.com', role: 'USER', avatarUrl: null, city: null } },
  });
});

describe('useLogin', () => {
  it('strips redirectTo out of the payload sent to authApi.login', async () => {
    (authApi.login as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: mockAuthResult } });
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    act(() => { result.current.mutate({ email: 'a@b.com', password: 'pw', redirectTo: '/settings' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(authApi.login).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pw' });
  });

  it('sets the auth store and both middleware cookies on success', async () => {
    (authApi.login as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: mockAuthResult } });
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    act(() => { result.current.mutate({ email: 'a@b.com', password: 'pw' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('access-1');
    expect(document.cookie).toContain('app_access_token=access-1');
    expect(document.cookie).toContain('app_user_role=USER');
  });

  it('REGRESSION (FIX AUTH-06): redirects to the provided redirectTo instead of always going to the dashboard', async () => {
    (authApi.login as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: mockAuthResult } });
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    act(() => { result.current.mutate({ email: 'a@b.com', password: 'pw', redirectTo: '/settings/security' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPush).toHaveBeenCalledWith('/settings/security');
  });

  it('falls back to the dashboard when no redirectTo is provided', async () => {
    (authApi.login as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: mockAuthResult } });
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    act(() => { result.current.mutate({ email: 'a@b.com', password: 'pw' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('enriches the minimal login user with a background /users/me call', async () => {
    (authApi.login as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: mockAuthResult } });
    (usersApi.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'user-1', name: 'Ahmed', email: 'a@example.com', role: 'USER', avatarUrl: 'https://x.com/a.jpg', city: 'غزة' } },
    });
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    act(() => { result.current.mutate({ email: 'a@b.com', password: 'pw' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(useAuthStore.getState().user?.city).toBe('غزة'));

    expect(useAuthStore.getState().user?.avatarUrl).toBe('https://x.com/a.jpg');
  });

  it('does not fail the login flow when the background /users/me enrichment call fails', async () => {
    (authApi.login as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: mockAuthResult } });
    (usersApi.getMe as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    act(() => { result.current.mutate({ email: 'a@b.com', password: 'pw' }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('shows an error toast and does not navigate when login fails', async () => {
    (authApi.login as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 400, data: { message: 'كلمة المرور غير صحيحة' } },
    });
    const { result } = renderHook(() => useLogin(), { wrapper: createWrapper() });

    act(() => { result.current.mutate({ email: 'a@b.com', password: 'wrong' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('useRegister', () => {
  it('sets auth, cookies, and redirects to the dashboard on success', async () => {
    (authApi.register as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: mockAuthResult } });
    const { result } = renderHook(() => useRegister(), { wrapper: createWrapper() });

    act(() => { result.current.mutate({ name: 'Ahmed', email: 'a@b.com', password: 'pw' } as any); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(document.cookie).toContain('app_access_token=access-1');
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('shows an error toast when registration fails (e.g. email already taken)', async () => {
    (authApi.register as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 409, data: { message: 'البريد الإلكتروني مستخدم بالفعل' } },
    });
    const { result } = renderHook(() => useRegister(), { wrapper: createWrapper() });

    act(() => { result.current.mutate({ name: 'Ahmed', email: 'a@b.com', password: 'pw' } as any); });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useLogout / useLogoutAll', () => {
  it('useLogout clears local session and redirects home on a successful server call', async () => {
    useAuthStore.getState().setAuth(mockAuthResult.user as any, mockAuthResult.tokens);
    (authApi.logout as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });

    act(() => { result.current.mutate(); });
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));

    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('REGRESSION: useLogout still clears local session even when the server call fails', async () => {
    useAuthStore.getState().setAuth(mockAuthResult.user as any, mockAuthResult.tokens);
    (authApi.logout as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
    // PROD-FIX-15: refreshToken no longer exists on this store to
    // assert against — accessToken (still in-memory state here) is
    // the equivalent "local session state was actually cleared" check.
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/');
  });

  it('useLogout clears the middleware cookies', async () => {
    useAuthStore.getState().setAuth(mockAuthResult.user as any, mockAuthResult.tokens);
    document.cookie = 'app_access_token=access-1';
    document.cookie = 'app_user_role=USER';
    (authApi.logout as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useLogout(), { wrapper: createWrapper() });

    act(() => { result.current.mutate(); });
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));

    expect(document.cookie).not.toContain('app_access_token=access-1');
  });

  it('REGRESSION: useLogoutAll also clears local session even when the server call fails', async () => {
    useAuthStore.getState().setAuth(mockAuthResult.user as any, mockAuthResult.tokens);
    (authApi.logoutAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useLogoutAll(), { wrapper: createWrapper() });

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
  });

  // UX-FIX P1-7: previously useLogoutAll had no onSuccess/onError at all —
  // only onSettled clearing local state — so a failed server-side
  // revocation was completely invisible to the user despite the
  // confirmation dialog promising "all sessions will be ended."
  it('UX-FIX P1-7: shows a success toast when the server call succeeds', async () => {
    useAuthStore.getState().setAuth(mockAuthResult.user as any, mockAuthResult.tokens);
    (authApi.logoutAll as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useLogoutAll(), { wrapper: createWrapper() });

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('UX-FIX P1-7: shows an error toast when the server call fails', async () => {
    useAuthStore.getState().setAuth(mockAuthResult.user as any, mockAuthResult.tokens);
    (authApi.logoutAll as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useLogoutAll(), { wrapper: createWrapper() });

    act(() => { result.current.mutate(); });

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});

describe('useRevokeSession', () => {
  it('shows a success toast on successful revocation', async () => {
    (authApi.revokeSession as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useRevokeSession(), { wrapper: createWrapper() });

    act(() => { result.current.mutate('session-1'); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(authApi.revokeSession).toHaveBeenCalledWith('session-1');
    expect(toast.success).toHaveBeenCalled();
  });

  it('shows an error toast when revocation fails', async () => {
    (authApi.revokeSession as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 404, data: { message: 'الجلسة غير موجودة' } },
    });
    const { result } = renderHook(() => useRevokeSession(), { wrapper: createWrapper() });

    act(() => { result.current.mutate('session-1'); });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalled();
  });
});

// FIX SEC-07 (frontend half): the backend now invalidates the caller's
// own current session on a successful password change (blacklists the
// access token, revokes all refresh tokens) — the frontend must not
// leave the user believing they're still logged in afterward.
describe('useChangePassword', () => {
  it('clears the local session and redirects to /login on success', async () => {
    useAuthStore.getState().setAuth(mockAuthResult.user as any, mockAuthResult.tokens);
    (authApi.changePassword as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useChangePassword(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ currentPassword: 'old123456', newPassword: 'new123456' });
    });

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
    expect(mockPush).toHaveBeenCalledWith('/login');
    expect(toast.success).toHaveBeenCalledWith('تم تغيير كلمة المرور بنجاح، يرجى تسجيل الدخول من جديد');
  });

  it('clears the middleware cookies on success', async () => {
    useAuthStore.getState().setAuth(mockAuthResult.user as any, mockAuthResult.tokens);
    document.cookie = 'app_access_token=access-1';
    document.cookie = 'app_user_role=USER';
    (authApi.changePassword as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useChangePassword(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ currentPassword: 'old123456', newPassword: 'new123456' });
    });

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(false));
    expect(document.cookie).not.toContain('app_access_token=access-1');
  });

  it('does NOT clear the local session or redirect when the request fails (e.g. wrong current password)', async () => {
    useAuthStore.getState().setAuth(mockAuthResult.user as any, mockAuthResult.tokens);
    (authApi.changePassword as ReturnType<typeof vi.fn>).mockRejectedValue({
      isAxiosError: true, response: { status: 400, data: { message: 'كلمة المرور الحالية غير صحيحة' } },
    });
    const { result } = renderHook(() => useChangePassword(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ currentPassword: 'wrong', newPassword: 'new123456' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    // Unlike useLogout (onSettled), a failed password change must leave
    // the user's existing session intact — they typed the wrong current
    // password, nothing changed server-side.
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(mockPush).not.toHaveBeenCalledWith('/login');
  });

  it('calls authApi.changePassword with the given payload', async () => {
    (authApi.changePassword as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useChangePassword(), { wrapper: createWrapper() });

    act(() => {
      result.current.mutate({ currentPassword: 'old123456', newPassword: 'new123456' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(authApi.changePassword).toHaveBeenCalledWith({
      currentPassword: 'old123456',
      newPassword: 'new123456',
    });
  });
});
