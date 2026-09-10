/**
 * __tests__/unit/hooks/useStoreMembers.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useStoreMembers, useMyMemberInvites } from '@/hooks/queries/useStoreMembers';
import { storeMembersApi } from '@/api/store-members.api';

vi.mock('@/api/store-members.api', () => ({
  storeMembersApi: {
    list: vi.fn(),
    listMyPendingInvites: vi.fn(),
  },
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: vi.fn((sel: (s: { isAuthenticated: boolean }) => unknown) =>
    sel({ isAuthenticated: true }),
  ),
  selectIsAuthenticated: (s: { isAuthenticated: boolean }) => s.isAuthenticated,
}));

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useStoreMembers', () => {
  beforeEach(() => {
    vi.mocked(storeMembersApi.list).mockReset();
    vi.mocked(storeMembersApi.listMyPendingInvites).mockReset();
    vi.mocked(storeMembersApi.list).mockResolvedValue({
      data: { data: { items: [], meta: {} } },
    } as never);
    vi.mocked(storeMembersApi.listMyPendingInvites).mockResolvedValue({
      data: { data: [] },
    } as never);
  });

  it('fetches members when authenticated and storeId set', async () => {
    const { result } = renderHook(() => useStoreMembers('store-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(storeMembersApi.list).toHaveBeenCalledWith('store-1', undefined);
  });

  it('does not fetch without storeId', async () => {
    renderHook(() => useStoreMembers(undefined), { wrapper: makeWrapper() });
    // allow microtasks
    await waitFor(() => expect(true).toBe(true));
    expect(storeMembersApi.list).not.toHaveBeenCalled();
  });
});

describe('useMyMemberInvites', () => {
  beforeEach(() => {
    vi.mocked(storeMembersApi.listMyPendingInvites).mockReset();
    vi.mocked(storeMembersApi.listMyPendingInvites).mockResolvedValue({
      data: { data: [] },
    } as never);
  });

  it('fetches pending invites when authenticated', async () => {
    const { result } = renderHook(() => useMyMemberInvites(), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(storeMembersApi.listMyPendingInvites).toHaveBeenCalled();
  });
});
