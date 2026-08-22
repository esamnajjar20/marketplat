/**
 * __tests__/unit/hooks/useSmallMutations.test.tsx
 *
 * Previously uncovered (0%): useBlockedUsersMutations.ts,
 * useNotificationMutations.ts, useConversationMutations.ts,
 * useServiceProviderMutations.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useToggleUserBlock } from '@/hooks/mutations/useBlockedUsersMutations';
import {
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/hooks/mutations/useNotificationMutations';
import { useStartConversation, useSendMessage, useDeleteMessage } from '@/hooks/mutations/useConversationMutations';
import {
  useCreateServiceProvider,
  useUpdateServiceProvider,
  useUploadServiceProviderLogo,
} from '@/hooks/mutations/useServiceProviderMutations';
import { blockedUsersApi } from '@/api/blocked-users.api';
import { notificationsApi } from '@/api/notifications.api';
import { conversationsApi } from '@/api/conversations.api';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { queryKeys } from '@/lib/queryKeys';
import { toast } from 'sonner';

vi.mock('@/api/blocked-users.api', () => ({
  blockedUsersApi: { toggleBlock: vi.fn() },
}));
vi.mock('@/api/notifications.api', () => ({
  notificationsApi: { markRead: vi.fn(), markAllRead: vi.fn() },
}));
vi.mock('@/api/conversations.api', () => ({
  conversationsApi: { start: vi.fn(), sendMessage: vi.fn(), deleteMessage: vi.fn() },
}));
vi.mock('@/api/service-providers.api', () => ({
  serviceProvidersApi: { createMyProvider: vi.fn(), updateMyProvider: vi.fn(), uploadLogo: vi.fn() },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), promise: vi.fn() },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper, invalidateSpy, queryClient };
}

beforeEach(() => vi.clearAllMocks());

describe('useToggleUserBlock', () => {
  it('calls blockedUsersApi.toggleBlock with the userId', async () => {
    (blockedUsersApi.toggleBlock as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { action: 'blocked' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useToggleUserBlock(), { wrapper });
    act(() => { result.current.mutate('user-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(blockedUsersApi.toggleBlock).toHaveBeenCalledWith('user-1');
  });

  it('adds the userId to the shared Set and shows a "blocked" toast when action is blocked', async () => {
    (blockedUsersApi.toggleBlock as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { action: 'blocked' } },
    });
    const { wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useToggleUserBlock(), { wrapper });
    act(() => { result.current.mutate('user-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const ids = queryClient.getQueryData<Set<string>>(queryKeys.blockedUsers.ids());
    expect(ids!.has('user-1')).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('تم حظر المستخدم');
  });

  it('removes the userId from the shared Set and shows an "unblocked" toast when action is unblocked', async () => {
    (blockedUsersApi.toggleBlock as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { action: 'unblocked' } },
    });
    const { wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(queryKeys.blockedUsers.ids(), new Set(['user-1']));

    const { result } = renderHook(() => useToggleUserBlock(), { wrapper });
    act(() => { result.current.mutate('user-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const ids = queryClient.getQueryData<Set<string>>(queryKeys.blockedUsers.ids());
    expect(ids!.has('user-1')).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('تم إلغاء حظر المستخدم');
  });

  it('invalidates the blocked-users list and the conversations list on success', async () => {
    (blockedUsersApi.toggleBlock as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { action: 'blocked' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useToggleUserBlock(), { wrapper });
    act(() => { result.current.mutate('user-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k.includes('blocked-users'))).toBe(true);
    expect(invalidatedKeys.some((k) => k.includes('conversations'))).toBe(true);
  });

  it('shows an error toast on failure', async () => {
    (blockedUsersApi.toggleBlock as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useToggleUserBlock(), { wrapper });
    act(() => { result.current.mutate('user-1'); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useMarkNotificationRead', () => {
  it('calls notificationsApi.markRead with the id and invalidates the notifications prefix', async () => {
    (notificationsApi.markRead as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    act(() => { result.current.mutate('notif-1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notificationsApi.markRead).toHaveBeenCalledWith('notif-1');
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['notifications']))).toBe(true);
  });

  it('does not show an error toast on failure (silent per design)', async () => {
    (notificationsApi.markRead as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMarkNotificationRead(), { wrapper });
    act(() => { result.current.mutate('notif-1'); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('useMarkAllNotificationsRead', () => {
  it('calls notificationsApi.markAllRead and invalidates the notifications prefix', async () => {
    (notificationsApi.markAllRead as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper });
    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notificationsApi.markAllRead).toHaveBeenCalled();
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['notifications']))).toBe(true);
  });

  it('shows an error toast on failure', async () => {
    (notificationsApi.markAllRead as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useMarkAllNotificationsRead(), { wrapper });
    act(() => { result.current.mutate(); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useStartConversation', () => {
  it('calls conversationsApi.start with the payload', async () => {
    (conversationsApi.start as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'c1' } },
    });
    const { wrapper } = createWrapper();
    const payload = { adId: 'ad-1', message: 'hi' } as unknown as Parameters<typeof conversationsApi.start>[0];

    const { result } = renderHook(() => useStartConversation(), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(conversationsApi.start).toHaveBeenCalledWith(payload);
  });

  it('invalidates the conversations list on success', async () => {
    (conversationsApi.start as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'c1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useStartConversation(), { wrapper });
    act(() => { result.current.mutate({} as Parameters<typeof conversationsApi.start>[0]); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['conversations', 'me']))).toBe(true);
  });

  it('shows an error toast on failure', async () => {
    (conversationsApi.start as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useStartConversation(), { wrapper });
    act(() => { result.current.mutate({} as Parameters<typeof conversationsApi.start>[0]); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useSendMessage', () => {
  it('calls conversationsApi.sendMessage with the conversationId and payload', async () => {
    (conversationsApi.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'm1' } },
    });
    const { wrapper } = createWrapper();
    const payload = { content: 'hello' } as unknown as Parameters<typeof conversationsApi.sendMessage>[1];

    const { result } = renderHook(() => useSendMessage('c1'), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(conversationsApi.sendMessage).toHaveBeenCalledWith('c1', payload);
  });

  it('invalidates this thread\'s messages and the conversations list on success', async () => {
    (conversationsApi.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'm1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useSendMessage('c1'), { wrapper });
    act(() => { result.current.mutate({} as Parameters<typeof conversationsApi.sendMessage>[1]); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['conversations', 'detail', 'c1', 'messages']))).toBe(true);
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['conversations', 'me']))).toBe(true);
  });

  it('shows an error toast on failure', async () => {
    (conversationsApi.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSendMessage('c1'), { wrapper });
    act(() => { result.current.mutate({} as Parameters<typeof conversationsApi.sendMessage>[1]); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useDeleteMessage', () => {
  it('calls conversationsApi.deleteMessage with the conversationId and messageId', async () => {
    (conversationsApi.deleteMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'm1', body: '', deletedAt: '2026-08-13T00:00:00.000Z' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteMessage('c1'), { wrapper });
    act(() => { result.current.mutate('m1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(conversationsApi.deleteMessage).toHaveBeenCalledWith('c1', 'm1');
  });

  it('invalidates this thread\'s messages but not the conversations list', async () => {
    (conversationsApi.deleteMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'm1', body: '', deletedAt: '2026-08-13T00:00:00.000Z' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useDeleteMessage('c1'), { wrapper });
    act(() => { result.current.mutate('m1'); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['conversations', 'detail', 'c1', 'messages']))).toBe(true);
    // Unlike useSendMessage, a deleted message doesn't bump the
    // conversation's updatedAt server-side, so the list itself is
    // never invalidated here — see useConversationMutations.ts's own
    // doc comment on useDeleteMessage for why.
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['conversations', 'me']))).toBe(false);
  });

  it('shows an error toast on failure', async () => {
    (conversationsApi.deleteMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDeleteMessage('c1'), { wrapper });
    act(() => { result.current.mutate('m1'); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useCreateServiceProvider', () => {
  it('calls serviceProvidersApi.createMyProvider with the payload', async () => {
    (serviceProvidersApi.createMyProvider as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'prov-1' } },
    });
    const { wrapper } = createWrapper();
    const payload = { bio: 'Plumber' } as unknown as Parameters<typeof serviceProvidersApi.createMyProvider>[0];

    const { result } = renderHook(() => useCreateServiceProvider(), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(serviceProvidersApi.createMyProvider).toHaveBeenCalledWith(payload);
  });

  it('invalidates the "my provider" query and shows a success toast', async () => {
    (serviceProvidersApi.createMyProvider as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'prov-1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useCreateServiceProvider(), { wrapper });
    act(() => { result.current.mutate({} as Parameters<typeof serviceProvidersApi.createMyProvider>[0]); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['service-providers', 'me']))).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('تم إنشاء ملف مقدم الخدمة بنجاح');
  });

  it('shows an error toast on failure', async () => {
    (serviceProvidersApi.createMyProvider as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useCreateServiceProvider(), { wrapper });
    act(() => { result.current.mutate({} as Parameters<typeof serviceProvidersApi.createMyProvider>[0]); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('useUpdateServiceProvider', () => {
  it('calls serviceProvidersApi.updateMyProvider with the payload', async () => {
    (serviceProvidersApi.updateMyProvider as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'prov-1' } },
    });
    const { wrapper } = createWrapper();
    const payload = { available: false } as unknown as Parameters<typeof serviceProvidersApi.updateMyProvider>[0];

    const { result } = renderHook(() => useUpdateServiceProvider(), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(serviceProvidersApi.updateMyProvider).toHaveBeenCalledWith(payload);
  });

  it('invalidates the "my provider" query and shows a success toast', async () => {
    (serviceProvidersApi.updateMyProvider as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'prov-1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useUpdateServiceProvider(), { wrapper });
    act(() => { result.current.mutate({} as Parameters<typeof serviceProvidersApi.updateMyProvider>[0]); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['service-providers', 'me']))).toBe(true);
    expect(toast.success).toHaveBeenCalledWith('تم حفظ التعديلات');
  });

  it('shows an error toast on failure', async () => {
    (serviceProvidersApi.updateMyProvider as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server error'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateServiceProvider(), { wrapper });
    act(() => { result.current.mutate({} as Parameters<typeof serviceProvidersApi.updateMyProvider>[0]); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });
});

const mockFile = new File(['fake-image-content'], 'logo.png', { type: 'image/png' });

describe('useUploadServiceProviderLogo', () => {
  it('calls serviceProvidersApi.uploadLogo with the given File', async () => {
    (serviceProvidersApi.uploadLogo as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'provider-1', logoUrl: 'https://cdn/logo.jpg' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUploadServiceProviderLogo(), { wrapper });
    act(() => { result.current.mutate(mockFile); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(serviceProvidersApi.uploadLogo).toHaveBeenCalledWith(mockFile);
  });

  it('invalidates the "my provider" query on success', async () => {
    (serviceProvidersApi.uploadLogo as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'provider-1' } },
    });
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useUploadServiceProviderLogo(), { wrapper });
    act(() => { result.current.mutate(mockFile); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k.includes('"me"'))).toBe(true);
  });

  it('shows a loading toast via toast.promise while the upload is pending', async () => {
    (serviceProvidersApi.uploadLogo as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'provider-1' } },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUploadServiceProviderLogo(), { wrapper });
    act(() => { result.current.mutate(mockFile); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toast.promise).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ loading: 'جارٍ رفع الشعار…', success: 'تم تحديث الشعار' }),
    );
  });

  it('passes an error-message resolver to toast.promise for failures', async () => {
    (serviceProvidersApi.uploadLogo as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('File too large'));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useUploadServiceProviderLogo(), { wrapper });
    act(() => { result.current.mutate(mockFile); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.promise).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ error: expect.any(Function) }),
    );
  });
});
