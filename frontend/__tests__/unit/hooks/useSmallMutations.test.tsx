/**
 * __tests__/unit/hooks/useSmallMutations.test.tsx
 *
 * Previously uncovered (0%): useBlockedUsersMutations.ts,
 * useNotificationMutations.ts, useConversationMutations.ts,
 * useServiceProviderMutations.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
import { useAuthStore } from '@/store/auth.store';

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ data }),
  } as Response;
}

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
afterEach(() => vi.unstubAllGlobals());

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
    expect(invalidatedKeys.some((k) => JSON.parse(k)[0] === 'notifications')).toBe(true);
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
    expect(invalidatedKeys.some((k) => JSON.parse(k)[0] === 'notifications')).toBe(true);
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
  it('uses native fetch with a stable offline operation id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'm1' }));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper, queryClient } = createWrapper();
    const payload = { body: 'hello', operationId: 'operation-1' };

    const { result } = renderHook(() => useSendMessage('c1'), { wrapper });
    act(() => { result.current.mutate(payload); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getMutationCache().getAll()[0]?.options.networkMode).toBe('offlineFirst');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/conversations\/c1\/messages$/);
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ body: 'hello' }),
    });
    expect(new Headers(init.headers).get('X-Offline-Op-Id')).toBe('operation-1');
  });

  it('updates the cached conversation preview optimistically while sending', async () => {
    let resolveSend!: (value: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => { resolveSend = resolve; })),
    );
    const { wrapper, queryClient } = createWrapper();
    const oldConversation = {
      id: 'c1', buyerId: 'u1', sellerId: 'u2', buyer: { id: 'u1', name: 'Me', avatarUrl: null },
      seller: { id: 'u2', name: 'Seller', avatarUrl: null }, adId: null, serviceRequestId: null,
      pinnedAt: null, archivedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z', ad: null, serviceRequest: null, unreadCount: 0,
      lastMessage: { id: 'old', conversationId: 'c1', senderId: 'u2', body: 'previous', imageUrl: null,
        readAt: null, deletedAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
    };
    queryClient.setQueryData(queryKeys.conversations.mine(), {
      items: [oldConversation],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    });

    useAuthStore.getState().setAuth(
      { id: 'u1', name: 'Me', email: 'me@example.com', role: 'USER' },
      { accessToken: 'test-token' },
    );
    const { result } = renderHook(() => useSendMessage('c1'), { wrapper });
    act(() => { result.current.mutate({ body: 'hello now' }); });

    await waitFor(() => {
      const cached = queryClient.getQueryData<{ items: Array<{ lastMessage: { body: string; id: string }; updatedAt: string }> }>(queryKeys.conversations.mine());
      expect(cached?.items[0].lastMessage.body).toBe('hello now');
      expect(cached?.items[0].lastMessage.id).toMatch(/^optimistic-/);
      expect(cached?.items[0].updatedAt).not.toBe('2026-01-01T00:00:00.000Z');
    });

    resolveSend(jsonResponse({ id: 'm2', conversationId: 'c1', senderId: 'u1', body: 'hello now',
      imageUrl: null, readAt: null, deletedAt: null, createdAt: '2026-10-11T18:00:00.000Z' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const cached = queryClient.getQueryData<{ items: Array<{ lastMessage: { id: string } }> }>(queryKeys.conversations.mine());
    expect(cached?.items[0].lastMessage.id).toBe('m2');
  });

  it('invalidates this thread\'s messages and the conversations list on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 'm1' })));
    const { wrapper, invalidateSpy } = createWrapper();

    const { result } = renderHook(() => useSendMessage('c1'), { wrapper });
    act(() => { result.current.mutate({ body: 'hello' }); });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['conversations', 'detail', 'c1', 'messages']))).toBe(true);
    expect(invalidatedKeys.some((k) => k === JSON.stringify(['conversations', 'me']))).toBe(true);
  });

  it('shows an error toast on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Server error')));
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSendMessage('c1'), { wrapper });
    act(() => { result.current.mutate({ body: 'hello' }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).toHaveBeenCalled();
  });

  it('treats the service worker queued response as an accepted offline send', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 202,
      json: async () => ({ queued: true, message: 'queued' }),
    }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useSendMessage('c1'), { wrapper });

    act(() => { result.current.mutate({ body: 'hello', operationId: 'queued-operation' }); });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toast.error).not.toHaveBeenCalled();
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
