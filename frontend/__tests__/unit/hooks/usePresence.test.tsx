/**
 * __tests__/unit/hooks/usePresence.test.tsx
 *
 * usePresence: auth-gated, disabled for an empty id list (no network
 * call), unwraps r.data.data into the id->bool map.
 * useIsUserOnline: single-id convenience wrapper — false for an
 * undefined id (no query fired at all) and reads the map correctly
 * for a real id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePresence, useIsUserOnline } from '@/hooks/queries/usePresence';
import { usersApi } from '@/api/users.api';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api/users.api', () => ({
  usersApi: { getPresence: vi.fn(), touchPresence: vi.fn() },
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

describe('usePresence', () => {
  it('does not fire when not authenticated', async () => {
    renderHook(() => usePresence(['user-1']), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(usersApi.getPresence).not.toHaveBeenCalled();
  });

  it('does not fire for an empty id list even when authenticated', async () => {
    login();
    renderHook(() => usePresence([]), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(usersApi.getPresence).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data once authenticated with ids', async () => {
    login();
    (usersApi.getPresence as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { 'user-1': true, 'user-2': false } },
    });

    const { result } = renderHook(() => usePresence(['user-1', 'user-2']), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ 'user-1': true, 'user-2': false });
    expect(usersApi.getPresence).toHaveBeenCalledWith(['user-1', 'user-2']);
  });
});

describe('useIsUserOnline', () => {
  it('returns false and fires no query for an undefined id', async () => {
    login();
    const { result } = renderHook(() => useIsUserOnline(undefined), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(result.current).toBe(false);
    expect(usersApi.getPresence).not.toHaveBeenCalled();
  });

  it('returns true when the map reports the id as online', async () => {
    login();
    (usersApi.getPresence as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { 'user-1': true } },
    });

    const { result } = renderHook(() => useIsUserOnline('user-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false when the map reports the id as offline', async () => {
    login();
    (usersApi.getPresence as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { 'user-1': false } },
    });

    const { result } = renderHook(() => useIsUserOnline('user-1'), { wrapper: createWrapper() });
    await waitFor(() => expect(usersApi.getPresence).toHaveBeenCalled());

    expect(result.current).toBe(false);
  });
});
