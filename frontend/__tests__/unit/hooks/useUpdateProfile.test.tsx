/**
 * __tests__/unit/hooks/useUpdateProfile.test.tsx
 *
 * Coverage targets:
 *  useUpdateProfile:
 *   - calls usersApi.updateMe with the given payload
 *   - on success: patches the auth store (name/city/avatarUrl)
 *   - on success: invalidates the auth.me query
 *   - on success: shows a success toast
 *   - on error: shows an error toast, does not patch the store
 *
 *  useUploadAvatar:
 *   - calls usersApi.uploadAvatar with the given File
 *   - on success: patches only avatarUrl in the auth store
 *   - on success: invalidates the auth.me query
 *   - on success: shows a success toast
 *   - on error: shows an error toast
 *
 *  useDeleteAccount (FIX INTEG-08):
 *   - calls usersApi.deleteMe with no arguments
 *   - on success: clears the auth store (logout), the two auth cookies,
 *     the entire query cache, shows a success toast, and redirects home
 *     — the backend has already revoked every session by the time this
 *     resolves, so there is no valid session left to keep locally
 *   - on error: shows an error toast and does NOT clear the session
 *     (a failed delete must not log the user out of a still-valid account)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useUpdateProfile, useUploadAvatar, useDeleteAccount } from '@/hooks/mutations/useUpdateProfile';
import { usersApi } from '@/api/users.api';
import { useAuthStore } from '@/store/auth.store';
import { toast } from 'sonner';

const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock('@/api/users.api', () => ({
  usersApi: {
    updateMe: vi.fn(),
    uploadAvatar: vi.fn(),
    deleteMe: vi.fn(),
  },
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

const mockUser = {
  id: 'user-1', name: 'Ahmed', email: 'ahmed@example.com', role: 'USER' as const,
};
// PROD-FIX-15: refreshToken removed — no longer part of AuthTokens.
const mockTokens = { accessToken: 'a' };

beforeEach(() => {
  vi.clearAllMocks();
  // Seed the store with a logged-in user so patchUser() has something to patch.
  useAuthStore.getState().setAuth(mockUser, mockTokens);
});

describe('useUpdateProfile', () => {
  it('calls usersApi.updateMe with the given payload', async () => {
    (usersApi.updateMe as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { ...mockUser, name: 'Ahmed Updated', city: 'غزة', avatarUrl: null } },
    });

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: createWrapper() });
    act(() => { result.current.mutate({ name: 'Ahmed Updated', city: 'غزة' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(usersApi.updateMe).toHaveBeenCalledWith({ name: 'Ahmed Updated', city: 'غزة' });
  });

  it('patches the auth store with the updated fields on success', async () => {
    (usersApi.updateMe as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { ...mockUser, name: 'New Name', city: 'خان يونس', avatarUrl: 'https://cdn/x.jpg' } },
    });

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: createWrapper() });
    act(() => { result.current.mutate({ name: 'New Name' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useAuthStore.getState().user?.name).toBe('New Name');
    expect(useAuthStore.getState().user?.city).toBe('خان يونس');
    expect(useAuthStore.getState().user?.avatarUrl).toBe('https://cdn/x.jpg');
  });

  it('falls back to null city/avatarUrl when the response omits them', async () => {
    (usersApi.updateMe as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { ...mockUser, name: 'New Name', city: undefined, avatarUrl: undefined } },
    });

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: createWrapper() });
    act(() => { result.current.mutate({ name: 'New Name' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useAuthStore.getState().user?.city).toBeNull();
    expect(useAuthStore.getState().user?.avatarUrl).toBeNull();
  });

  it('shows a success toast on success', async () => {
    (usersApi.updateMe as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { ...mockUser, city: null, avatarUrl: null } },
    });

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: createWrapper() });
    act(() => { result.current.mutate({ name: 'X' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم حفظ التغييرات');
  });

  it('shows an error toast and does not patch the store on failure', async () => {
    (usersApi.updateMe as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const nameBefore = useAuthStore.getState().user?.name;

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: createWrapper() });
    act(() => { result.current.mutate({ name: 'Should Not Apply' }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
    expect(useAuthStore.getState().user?.name).toBe(nameBefore);
  });
});

describe('useUploadAvatar', () => {
  const mockFile = new File(['x'], 'avatar.jpg', { type: 'image/jpeg' });

  it('calls usersApi.uploadAvatar with the given file', async () => {
    (usersApi.uploadAvatar as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { ...mockUser, avatarUrl: 'https://cdn/avatar.jpg' } },
    });

    const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() });
    act(() => { result.current.mutate(mockFile); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(usersApi.uploadAvatar).toHaveBeenCalledWith(mockFile);
  });

  it('patches only avatarUrl in the auth store on success (name/city untouched)', async () => {
    useAuthStore.getState().patchUser({ name: 'Existing Name', city: 'غزة' });
    (usersApi.uploadAvatar as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { ...mockUser, avatarUrl: 'https://cdn/new-avatar.jpg' } },
    });

    const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() });
    act(() => { result.current.mutate(mockFile); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const user = useAuthStore.getState().user;
    expect(user?.avatarUrl).toBe('https://cdn/new-avatar.jpg');
    expect(user?.name).toBe('Existing Name'); // unchanged
    expect(user?.city).toBe('غزة'); // unchanged
  });

  it('falls back to null avatarUrl when the response omits it', async () => {
    (usersApi.uploadAvatar as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { ...mockUser, avatarUrl: undefined } },
    });

    const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() });
    act(() => { result.current.mutate(mockFile); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useAuthStore.getState().user?.avatarUrl).toBeNull();
  });

  it('shows a success toast on success', async () => {
    (usersApi.uploadAvatar as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { ...mockUser, avatarUrl: 'https://cdn/x.jpg' } },
    });

    const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() });
    act(() => { result.current.mutate(mockFile); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم تحديث الصورة الشخصية');
  });

  it('shows an error toast on failure (e.g. oversized file rejected by backend)', async () => {
    (usersApi.uploadAvatar as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('File too large'));

    const { result } = renderHook(() => useUploadAvatar(), { wrapper: createWrapper() });
    act(() => { result.current.mutate(mockFile); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useDeleteAccount', () => {
  it('calls usersApi.deleteMe with no arguments', async () => {
    (usersApi.deleteMe as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });

    const { result } = renderHook(() => useDeleteAccount(), { wrapper: createWrapper() });
    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(usersApi.deleteMe).toHaveBeenCalledWith();
  });

  it('logs the user out of the local session on success', async () => {
    (usersApi.deleteMe as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });

    const { result } = renderHook(() => useDeleteAccount(), { wrapper: createWrapper() });
    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('shows a success toast and redirects to the home page on success', async () => {
    (usersApi.deleteMe as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });

    const { result } = renderHook(() => useDeleteAccount(), { wrapper: createWrapper() });
    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.success).toHaveBeenCalledWith('تم حذف حسابك بنجاح');
    expect(mockRouterPush).toHaveBeenCalledWith('/');
  });

  it('shows an error toast and does NOT clear the session when the delete fails', async () => {
    (usersApi.deleteMe as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useDeleteAccount(), { wrapper: createWrapper() });
    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
    // A failed delete must not log the user out of a still-valid account.
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});
