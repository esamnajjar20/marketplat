/**
 * __tests__/unit/hooks/useNotificationsReportsConversations.test.tsx
 *
 * Previously uncovered (0%): useNotifications.ts, useMyReports.ts,
 * useConversations.ts.
 *
 *  useMyNotifications / useUnreadNotificationCount: auth-gated.
 *   useUnreadNotificationCount defaults to 0 when count is missing.
 *  useMyReports: auth-gated, unwraps r.data.data.
 *  useMyConversations / useConversation / useMessages: auth-gated (+
 *   id gating for the latter two). useMessages reverses the page's
 *   items into chronological order and falls back to an empty page
 *   shape when the response has no data.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useMyNotifications, useUnreadNotificationCount } from '@/hooks/queries/useNotifications';
import { useMyReports } from '@/hooks/queries/useMyReports';
import { useMyConversations, useConversation, useMessages } from '@/hooks/queries/useConversations';
import { notificationsApi } from '@/api/notifications.api';
import { reportsApi } from '@/api/reports.api';
import { conversationsApi } from '@/api/conversations.api';
import { useAuthStore } from '@/store/auth.store';

vi.mock('@/api/notifications.api', () => ({
  notificationsApi: { getMine: vi.fn(), getUnreadCount: vi.fn() },
}));
vi.mock('@/api/reports.api', () => ({
  reportsApi: { getMyReports: vi.fn() },
}));
vi.mock('@/api/conversations.api', () => ({
  conversationsApi: { getMine: vi.fn(), getById: vi.fn(), getMessages: vi.fn() },
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
  // useNotifications seeds initialData from lib/notificationsCache.ts
  // (real localStorage) and useEffect writes back to it on every
  // successful fetch — without clearing it, a value saved by one test
  // (e.g. unreadCount: 0) leaks in as fresh initialData for the next
  // test and suppresses the refetch that would pick up its own mock.
  localStorage.clear();
});

function login() {
  useAuthStore.getState().setAuth(
    { id: 'u1', name: 'Ahmed', email: 'a@b.com', role: 'USER' },
    { accessToken: 'a' },
  );
}

describe('useMyNotifications', () => {
  it('does not fire when not authenticated', async () => {
    renderHook(() => useMyNotifications(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationsApi.getMine).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data once authenticated', async () => {
    login();
    (notificationsApi.getMine as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'n1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useMyNotifications(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ items: [{ id: 'n1' }], meta: { total: 1 } });
  });
});

describe('useUnreadNotificationCount', () => {
  it('does not fire when not authenticated', async () => {
    renderHook(() => useUnreadNotificationCount(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notificationsApi.getUnreadCount).not.toHaveBeenCalled();
  });

  it('defaults to 0 when the response has no count', async () => {
    login();
    (notificationsApi.getUnreadCount as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: undefined },
    });

    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(0);
  });

  it('returns the count when present', async () => {
    login();
    (notificationsApi.getUnreadCount as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { count: 4 } },
    });

    const { result } = renderHook(() => useUnreadNotificationCount(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(4);
  });
});

describe('useMyReports', () => {
  it('does not fire when not authenticated', async () => {
    renderHook(() => useMyReports(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reportsApi.getMyReports).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data once authenticated', async () => {
    login();
    (reportsApi.getMyReports as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'rep-1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useMyReports(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ items: [{ id: 'rep-1' }], meta: { total: 1 } });
  });
});

describe('useMyConversations', () => {
  it('does not fire when not authenticated', async () => {
    renderHook(() => useMyConversations(), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(conversationsApi.getMine).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data once authenticated', async () => {
    login();
    (conversationsApi.getMine as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { items: [{ id: 'c1' }], meta: { total: 1 } } },
    });

    const { result } = renderHook(() => useMyConversations(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ items: [{ id: 'c1' }], meta: { total: 1 } });
  });
});

describe('useConversation', () => {
  it('does not fire when not authenticated, even with a valid id', async () => {
    renderHook(() => useConversation('c1'), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(conversationsApi.getById).not.toHaveBeenCalled();
  });

  it('does not fire when authenticated but the id is empty', async () => {
    login();
    renderHook(() => useConversation(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(conversationsApi.getById).not.toHaveBeenCalled();
  });

  it('fires and unwraps r.data.data when authenticated with a valid id', async () => {
    login();
    (conversationsApi.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: { id: 'c1', adId: 'ad-1' } },
    });

    const { result } = renderHook(() => useConversation('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({ id: 'c1', adId: 'ad-1' });
  });
});

describe('useMessages', () => {
  it('does not fire when not authenticated, even with a valid conversationId', async () => {
    renderHook(() => useMessages('c1'), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(conversationsApi.getMessages).not.toHaveBeenCalled();
  });

  it('does not fire when authenticated but conversationId is empty', async () => {
    login();
    renderHook(() => useMessages(''), { wrapper: createWrapper() });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(conversationsApi.getMessages).not.toHaveBeenCalled();
  });

  it('reverses the newest-first page into chronological order', async () => {
    login();
    (conversationsApi.getMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        data: {
          items: [{ id: 'm3' }, { id: 'm2' }, { id: 'm1' }],
          meta: { total: 3, page: 1, limit: 3, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        },
      },
    });

    const { result } = renderHook(() => useMessages('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.items).toEqual([{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }]);
  });

  it('falls back to an empty page shape when the response has no data', async () => {
    login();
    (conversationsApi.getMessages as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { data: undefined },
    });

    const { result } = renderHook(() => useMessages('c1'), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual({
      items: [],
      meta: { total: 0, page: 1, limit: 0, totalPages: 0, hasNextPage: false, hasPrevPage: false },
    });
  });
});
